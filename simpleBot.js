    require('dotenv').config();
    const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, PermissionFlagsBits } = require('discord.js');
    const Database = require('better-sqlite3');
    const db = new Database('xp.db');

    // Discord client'ı oluştur
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.GuildVoiceStates,
            GatewayIntentBits.GuildPresences
        ],
        partials: [
            Partials.Message,
            Partials.Channel,
            Partials.Reaction
        ]
    });

    // Veritabanı tablolarını oluştur
    db.prepare(`
        CREATE TABLE IF NOT EXISTS user_xp (
            user_id TEXT PRIMARY KEY,
            xp INTEGER DEFAULT 0,
            voice_time INTEGER DEFAULT 0,
            afk_time INTEGER DEFAULT 0,
            last_xp_time INTEGER DEFAULT 0,
            last_voice_xp_time INTEGER DEFAULT 0,
            invites INTEGER DEFAULT 0
        )
    `).run();

    db.prepare(`
        CREATE TABLE IF NOT EXISTS user_settings (
            user_id TEXT PRIMARY KEY,
            language TEXT DEFAULT 'az'
        )
    `).run();

    // XP işlemleri için hazır sorgular
    const getXP = db.prepare('SELECT * FROM user_xp WHERE user_id = ?');
    const setXP = db.prepare('INSERT OR REPLACE INTO user_xp (user_id, xp, voice_time, afk_time, last_xp_time, last_voice_xp_time) VALUES (?, ?, ?, ?, ?, ?)');

    // Dil işlemleri için hazır sorgular
    const getLanguage = db.prepare('SELECT language FROM user_settings WHERE user_id = ?');
    const setLanguage = db.prepare('INSERT OR REPLACE INTO user_settings (user_id, language) VALUES (?, ?)');

    // Dil çevirileri
    const translations = {
        tr: {
            xp_level: "Seviye",
            xp_total: "Toplam XP",
            xp_progress: "İlerleme",
            xp_next_level: "Sonraki seviye için",
            xp_needed: "XP gerekli",
            level_up: "Seviye Atladın!",
            congrats: "Tebrikler",
            reached_level: "seviyesine ulaştın!",
            commands_title: "Bot Komutları",
            language_changed: "Diliniz başarıyla değiştirildi!",
            current_language: "Mevcut diliniz:",
            rank_info: "Rütbə və səviyyə məlumatlarını göstərir",
            current_rank: "İstifadəçinin cari rütbəsi",
            next_rank: "Növbəti rütbə",
            total_xp: "Ümumi XP",
            voice_time: "Ses vaxtı",
            afk_time: "AFK vaxtı",
            progress: "İlerleme",
            next_rank_req: "Növbəti rütbəni əldə etmək üçün lazım olan XP: {xp}",
            max_rank_reached: "Maksimum rütbə əldə edildi!",
            invites: "Davet Sayısı",
            next_rank_req_full: "Sonraki rütbe için gereken: {xp} XP ve {invites} yeni davet"
        },
        az: {
            xp_level: "Səviyyə",
            xp_total: "Ümumi XP",
            xp_progress: "İrəliləyiş",
            xp_next_level: "Növbəti səviyyə üçün",
            xp_needed: "XP lazımdır",
            level_up: "Səviyyə Artımı!",
            congrats: "Təbriklər",
            reached_level: "səviyyəsinə çatdınız!",
            commands_title: "Bot Əmrləri",
            language_changed: "Diliniz uğurla dəyişdirildi!",
            current_language: "Mövcud diliniz:",
            rank_info: "Rütbə və səviyyə məlumatlarını göstərir",
            current_rank: "İstifadəçinin cari rütbəsi",
            next_rank: "Növbəti rütbə",
            total_xp: "Ümumi XP",
            voice_time: "Ses vaxtı",
            afk_time: "AFK vaxtı",
            progress: "İlerleme",
            next_rank_req: "Növbəti rütbəni əldə etmək üçün lazım olan XP: {xp}",
            max_rank_reached: "Maksimum rütbə əldə edildi!",
            invites: "Dəvət Sayı",
            next_rank_req_full: "Növbəti rütbə üçün lazım olan: {xp} XP və {invites} yeni dəvət"
        }
    };

    // Kullanıcının dilini al
    function getUserLanguage(userId) {
        const data = getLanguage.get(userId);
        return data ? data.language : 'az';
    }

    // Mesaja göre çeviri al
    function getTranslation(userId, key) {
        const lang = getUserLanguage(userId);
        return translations[lang][key];
    }

    // XP Sistemi Ayarları
    const XP_SETTINGS = {
        MESSAGE_XP: 100,
        VOICE_XP_PER_HOUR: 3000,
        AFK_XP_PER_HOUR: 1000,
        XP_COOLDOWN: 30000,
        VOICE_CHECK_INTERVAL: 60000
    };

    // XP yönetim fonksiyonları
    function getUserData(userId) {
        const data = db.prepare('SELECT * FROM user_xp WHERE user_id = ?').get(userId);
        return data || { 
            user_id: userId, 
            xp: 0, 
            voice_time: 0, 
            afk_time: 0, 
            last_xp_time: 0,
            last_voice_xp_time: 0,
            invites: 0
        };
    }

    function updateUserData(userId, data) {
        db.prepare(`
            INSERT OR REPLACE INTO user_xp 
            (user_id, xp, voice_time, afk_time, last_xp_time, last_voice_xp_time) 
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            userId,
            data.xp,
            data.voice_time,
            data.afk_time,
            data.last_xp_time,
            data.last_voice_xp_time
        );
    }

    // Ses kanalı XP kontrolü için interval
    setInterval(async () => {
        try {
            const now = Date.now();
            client.guilds.cache.forEach(guild => {
                guild.channels.cache.filter(channel => channel.type === 2).forEach(channel => {
                    channel.members.forEach(member => {
                        if (member.user.bot) return;
                        
                        // Rol kontrolü
                        if (!hasRequiredRole(member)) return;

                        const userData = getUserData(member.id);
                        const timeSinceLastVoiceXP = now - (userData.last_voice_xp_time || 0);

                        if (timeSinceLastVoiceXP >= XP_SETTINGS.VOICE_CHECK_INTERVAL) {
                            const isAFK = channel.name.toLowerCase().includes('afk');
                            const xpToAdd = Math.floor((isAFK ? XP_SETTINGS.AFK_XP_PER_HOUR : XP_SETTINGS.VOICE_XP_PER_HOUR) * (XP_SETTINGS.VOICE_CHECK_INTERVAL / 3600000));

                            userData.xp += xpToAdd;
                            userData.last_voice_xp_time = now;
                            if (isAFK) {
                                userData.afk_time += XP_SETTINGS.VOICE_CHECK_INTERVAL;
                            } else {
                                userData.voice_time += XP_SETTINGS.VOICE_CHECK_INTERVAL;
                            }

                            updateUserData(member.id, userData);
                        }
                    });
                });
            });
        } catch (error) {
            console.error('Ses XP kontrolü hatası:', error);
        }
    }, XP_SETTINGS.VOICE_CHECK_INTERVAL);

    // Kanal ID'leri
    const MENU_CHANNEL_ID = '1329931397606936606';
    const COMMAND_CHANNEL_ID = '1308939577557516393';
    const REQUIRED_ROLE_ID = '1335732788397346897';

    // Rol kontrolü için yardımcı fonksiyon
    function hasRequiredRole(member) {
        return member.roles.cache.has(REQUIRED_ROLE_ID);
    }

    client.on('ready', async () => {
        console.log(`Bot ${client.user.tag} olarak giriş yaptı!`);
        
        try {
            const commands = [
                {
                    name: 'rank',
                    description: 'Rütbə və səviyyə məlumatlarını göstərir',
                    type: 1,
                    options: [
                        {
                            name: 'istifadeci',
                            description: 'Məlumatlarını görmək istədiyiniz istifadəçi (boş buraxsanız özünüz)',
                            type: 6,
                            required: false
                        }
                    ]
                },
                {
                    name: 'dil',
                    description: 'Bot dilini değiştir / Bot dilini dəyiş',
                    options: [
                        {
                            name: 'secim',
                            description: 'Dil seçimi / Dil seçimi',
                            type: 3,
                            required: true,
                            choices: [
                                { name: 'Türkçe', value: 'tr' },
                                { name: 'Azərbaycan dili', value: 'az' }
                            ]
                        }
                    ]
                }
            ];

            // Komutları doğrudan sunucuya kaydet
            const guild = client.guilds.cache.first();
            if (guild) {
                await guild.commands.set(commands);
                console.log('Komutlar başarıyla kaydedildi!');
            }

            // Menü kanalını bul ve menüyü oluştur
            const menuChannel = await client.channels.fetch(MENU_CHANNEL_ID);
            if (menuChannel) {
                // Önceki mesajları temizle
                const messages = await menuChannel.messages.fetch({ limit: 100 });
                await menuChannel.bulkDelete(messages).catch(() => {});

                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('🎭 Rol Seçim Menüsü / Rol Seçim Menyusu')
                    .setDescription('Aşağıdaki menüden kendinize uygun oyun rollerini seçebilirsiniz.\nAşağıdakı menyudan özünüzə uyğun oyun rollarını seçə bilərsiniz.')
                    .setTimestamp();

                const gamesMenu = new StringSelectMenuBuilder()
                    .setCustomId('select_games')
                    .setPlaceholder('Oyunlar / Oyunlar')
                    .setMinValues(0)
                    .setMaxValues(14)
                    .addOptions([
                        { label: 'Valorant', value: 'valorant', emoji: '🎮', description: 'Valorant oyuncusu / Valorant oyunçusu' },
                        { label: 'GusGusDuck', value: 'gusgus', emoji: '🦆', description: 'GusGusDuck oyuncusu / GusGusDuck oyunçusu' },
                        { label: 'League of Legends', value: 'lol', emoji: '⚔️', description: 'LoL oyuncusu / LoL oyunçusu' },
                        { label: 'GTA V', value: 'gtav', emoji: '🚗', description: 'GTA V oyuncusu / GTA V oyunçusu' },
                        { label: 'Point Blank', value: 'pointblank', emoji: '🎯', description: 'Point Blank oyuncusu / Point Blank oyunçusu' },
                        { label: 'CS:GO', value: 'csgo', emoji: '🔫', description: 'CSGO oyuncusu / CSGO oyunçusu' },
                        { label: 'Minecraft', value: 'minecraft', emoji: '⛏️', description: 'Minecraft oyuncusu / Minecraft oyunçusu' },
                        { label: 'Rainbow Six Siege', value: 'rainbow', emoji: '🌈', description: 'Rainbow Six oyuncusu / Rainbow Six oyunçusu' },
                        { label: 'Arena Breakout', value: 'arena', emoji: '🏹', description: 'Arena Breakout oyuncusu / Arena Breakout oyunçusu' },
                        { label: 'PUBG', value: 'pubg', emoji: '🪂', description: 'PUBG oyuncusu / PUBG oyunçusu' },
                        { label: 'Feign', value: 'feign', emoji: '🎲', description: 'Feign oyuncusu / Feign oyunçusu' },
                        { label: 'TFT', value: 'tft', emoji: '🎪', description: 'TFT oyuncusu / TFT oyunçusu' },
                        { label: 'Mirai', value: 'mirai', emoji: '🎭', description: 'Mirai oyuncusu / Mirai oyunçusu' },
                        { label: 'Roblox', value: 'roblox', emoji: '🎪', description: 'Roblox oyuncusu / Roblox oyunçusu' }
                    ]);

                const rows = [
                    new ActionRowBuilder().addComponents(gamesMenu)
                ];

                await menuChannel.send({ embeds: [embed], components: rows });
                console.log('Rol menüsü başarıyla oluşturuldu!');
            }

            // Davet sistemini dinle
            client.guilds.cache.forEach(guild => {
                guild.invites.fetch().then(guildInvites => {
                    cachedInvites.set(guild.id, new Map(guildInvites.map(invite => [invite.code, invite.uses])));
                });
            });
        } catch (error) {
            console.error('Başlangıç işlemleri sırasında hata oluştu:', error);
        }
    });

    // Davet takibi için cache
    const cachedInvites = new Map();

    // Rütbe rolü güncelleme fonksiyonu
    async function updateUserRank(member, userData) {
        try {
            const currentRank = getCurrentRank(userData.xp, userData.invites || 0);
            console.log(`Rütbe güncelleniyor - Kullanıcı: ${member.user.tag}, Rütbe: ${currentRank.name}`);
            
            // Bot'un yetkilerini kontrol et
            const botMember = member.guild.members.me;
            if (!botMember) {
                console.error('Bot üye bilgisi alınamadı!');
                return;
            }

            // Bot'un yetkilerini detaylı kontrol et
            const permissions = botMember.permissions.toArray();
            console.log('Bot yetkileri:', permissions);
            
            if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
                console.error('Bot\'un rol yönetme yetkisi yok!');
                return;
            }

            // Mevcut rütbe rolünü kontrol et
            const currentRankRole = member.guild.roles.cache.get(currentRank.roleId);
            if (!currentRankRole) {
                console.error(`Rol bulunamadı: ${currentRank.roleId}`);
                return;
            }

            // Eğer kullanıcıda zaten bu rol varsa hiçbir şey yapma
            if (member.roles.cache.has(currentRankRole.id)) {
                console.log(`Kullanıcı zaten ${currentRank.name} rütbesine sahip.`);
                return;
            }

            console.log(`Rol bulundu: ${currentRankRole.name}`);
            console.log(`Bot rolü pozisyonu: ${botMember.roles.highest.position}`);
            console.log(`Verilecek rol pozisyonu: ${currentRankRole.position}`);

            // Bot'un rolünün pozisyonunu kontrol et
            if (botMember.roles.highest.position <= currentRankRole.position) {
                console.error('Bot\'un rolü verilecek rolden daha düşük pozisyonda!');
                return;
            }

            // Önceki tüm rütbe rollerini kaldır
            for (const rank of ranks) {
                const roleToRemove = member.guild.roles.cache.get(rank.roleId);
                if (roleToRemove && member.roles.cache.has(roleToRemove.id)) {
                    console.log(`Eski rol kaldırılıyor: ${roleToRemove.name}`);
                    await member.roles.remove(roleToRemove).catch(error => {
                        console.error(`Rol kaldırma hatası: ${error.message}`);
                    });
                }
            }
            
            // Yeni rütbe rolünü ver
            console.log(`Yeni rol veriliyor: ${currentRankRole.name}`);
            await member.roles.add(currentRankRole).catch(error => {
                console.error(`Rol verme hatası: ${error.message}`);
                throw error;
            });
            
            // Kullanıcıya bildirim gönder
            const channel = member.guild.channels.cache.get(COMMAND_CHANNEL_ID);
            if (channel) {
                const embed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('🎖️ Yeni Rütbe!')
                    .setDescription(`Tebrikler ${member}! Yeni rütbeniz: **${currentRank.name}**`)
                    .setTimestamp();
                
                await channel.send({ embeds: [embed] }).catch(error => {
                    console.error(`Bildirim gönderme hatası: ${error.message}`);
                });
            }
        } catch (error) {
            console.error('Rütbe güncelleme hatası:', error);
            throw error;
        }
    }

    // Yeni üye katıldığında davet sayısını güncelle
    client.on('guildMemberAdd', async member => {
        try {
            const guildInvites = await member.guild.invites.fetch();
            const oldInvites = cachedInvites.get(member.guild.id);
            const invite = guildInvites.find(i => i.uses > oldInvites.get(i.code));
            
            if (invite) {
                const inviter = await client.users.fetch(invite.inviter.id);
                const userData = getUserData(inviter.id);
                userData.invites = (userData.invites || 0) + 1;
                updateUserData(inviter.id, userData);
                
                // Davet eden kişinin rütbesini güncelle
                const inviterMember = await member.guild.members.fetch(inviter.id);
                await updateUserRank(inviterMember, userData);
            }
            
            // Cache'i güncelle
            cachedInvites.set(member.guild.id, new Map(guildInvites.map(invite => [invite.code, invite.uses])));
        } catch (error) {
            console.error('Davet takip hatası:', error);
        }
    });

    // Rütbe bilgileri
    const ranks = [
        { id: 1, name: 'Əsgər', xp: 0, invites: 0, roleId: '1334746437526753385' },
        { id: 2, name: 'Kiçik Çavuş', xp: 50000, invites: 3, roleId: '1334746446469009459' },
        { id: 3, name: 'Çavuş', xp: 100000, invites: 6, roleId: '1334746456220897280' },
        { id: 4, name: 'Baş Çavuş', xp: 200000, invites: 9, roleId: '1334746465653755985' },
        { id: 5, name: 'Kiçik Leytanant', xp: 400000, invites: 12, roleId: '1334746474877026411' },
        { id: 6, name: 'Leytanant', xp: 800000, invites: 15, roleId: '1334746484444368906' },
        { id: 7, name: 'Kapitan', xp: 1600000, invites: 18, roleId: '1334746503205621872' },
        { id: 8, name: 'Mayor', xp: 3200000, invites: 21, roleId: '1334746512273445019' },
        { id: 9, name: 'Palkovnik', xp: 6400000, invites: 24, roleId: '1334746531248738357' },
        { id: 10, name: 'General', xp: 12800000, invites: 27, roleId: '1334746540383801367' }
    ];

    // Rütbe hesaplama fonksiyonları
    function getCurrentRank(xp, invites) {
        for (let i = ranks.length - 1; i >= 0; i--) {
            if (xp >= ranks[i].xp && invites >= ranks[i].invites) {
                return ranks[i];
            }
        }
        return ranks[0];
    }

    function getNextRank(xp, invites) {
        for (let rank of ranks) {
            if (xp < rank.xp || invites < rank.invites) {
                return rank;
            }
        }
        return ranks[ranks.length - 1];
    }

    // Davet sayısını güncelleme fonksiyonu
    function updateInvites(userId, inviteCount) {
        const userData = getUserData(userId);
        userData.invites = inviteCount;
        updateUserData(userId, userData);
    }

    // Slash komut işleyici
    client.on('interactionCreate', async interaction => {
        try {
            if (interaction.isChatInputCommand()) {
                // Rank ve dil komutları için kanal kontrolü
                if ((interaction.commandName === 'rank' || interaction.commandName === 'dil') && 
                    interaction.channelId !== COMMAND_CHANNEL_ID) {
                    return interaction.reply({
                        content: `❌ Bu komutu sadece <#${COMMAND_CHANNEL_ID}> kanalında kullanabilirsiniz!`,
                        ephemeral: true
                    });
                }

                if (interaction.commandName === 'rank') {
                    // Rol kontrolü
                    if (!hasRequiredRole(interaction.member)) {
                        return interaction.reply({
                            content: '❌ Bu komutu kullanmak için gerekli role sahip değilsiniz!',
                            ephemeral: true
                        });
                    }

                    const targetUser = interaction.options.getUser('istifadeci') || interaction.user;
                    const userData = getUserData(targetUser.id);
                    
                    // Rütbe rolünü güncelle
                    if (targetUser.id === interaction.user.id) {
                        await updateUserRank(interaction.member, userData);
                    }
                    
                    const currentRank = getCurrentRank(userData.xp, userData.invites || 0);
                    const nextRank = getNextRank(userData.xp, userData.invites || 0);
                    
                    const progressToNext = nextRank.id > currentRank.id ? 
                        Math.floor((userData.xp - currentRank.xp) / (nextRank.xp - currentRank.xp) * 100) : 100;
                    
                    const progressBar = getProgressBar(userData.xp - currentRank.xp, nextRank.xp - currentRank.xp);

                    const embed = new EmbedBuilder()
                        .setColor('#0099ff')
                        .setTitle(`${targetUser.username} - ${getTranslation(interaction.user.id, 'rank_info')}`)
                        .setThumbnail(targetUser.displayAvatarURL())
                        .addFields(
                            { name: `🎖️ ${getTranslation(interaction.user.id, 'current_rank')}`, value: currentRank.name, inline: true },
                            { name: `⭐ ${getTranslation(interaction.user.id, 'next_rank')}`, value: nextRank.id > currentRank.id ? nextRank.name : getTranslation(interaction.user.id, 'max_rank'), inline: true },
                            { name: `📊 ${getTranslation(interaction.user.id, 'total_xp')}`, value: userData.xp.toString(), inline: true },
                            { name: `🎙️ ${getTranslation(interaction.user.id, 'voice_time')}`, value: formatTime(userData.voice_time), inline: true },
                            { name: `💤 ${getTranslation(interaction.user.id, 'afk_time')}`, value: formatTime(userData.afk_time), inline: true },
                            { name: `📨 ${getTranslation(interaction.user.id, 'invites')}`, value: (userData.invites || 0).toString() + '/3', inline: true },
                            { name: `📈 ${getTranslation(interaction.user.id, 'progress')}`, value: `${progressBar} ${progressToNext}%`, inline: false }
                        )
                        .setFooter({ text: nextRank.id > currentRank.id ? 
                            getTranslation(interaction.user.id, 'next_rank_req_full')
                                .replace('{xp}', nextRank.xp - userData.xp)
                                .replace('{invites}', 3) : 
                            getTranslation(interaction.user.id, 'max_rank_reached') })
                        .setTimestamp();

                    await interaction.reply({ embeds: [embed] });
                }
                else if (interaction.commandName === 'dil') {
                    const selectedLanguage = interaction.options.getString('secim');
                    setLanguage.run(interaction.user.id, selectedLanguage);

                    const response = selectedLanguage === 'tr' ? 
                        'Diliniz başarıyla Türkçe olarak ayarlandı!' :
                        'Diliniz uğurla Azərbaycan dilinə dəyişdirildi!';

                    await interaction.reply({
                        content: response,
                        ephemeral: true
                    });
                }
            }
            else if (interaction.isStringSelectMenu()) {
                if (interaction.customId === 'select_games') {
                    const selection = interaction.values[0];
                    const member = interaction.member;
                    let roleName = '';
                    let roleId = '';

                    switch (selection) {
                        case 'valorant':
                            roleId = '1329927861276114974';
                            roleName = 'Valorant';
                            break;
                        case 'gusgus':
                            roleId = '1329903990762115072';
                            roleName = 'GusGusDuck';
                            break;
                        case 'lol':
                            roleId = '1329927948588814337';
                            roleName = 'League of Legends';
                            break;
                        case 'gtav':
                            roleId = '1329938250004959353';
                            roleName = 'GTA V';
                            break;
                        case 'pointblank':
                            roleId = '1329943517631615027';
                            roleName = 'Point Blank';
                            break;
                        case 'csgo':
                            roleId = '1329947408620191830';
                            roleName = 'CS:GO';
                            break;
                        case 'minecraft':
                            roleId = '1329947517739204721';
                            roleName = 'Minecraft';
                            break;
                        case 'rainbow':
                            roleId = '1329947708244627578';
                            roleName = 'Rainbow Six Siege';
                            break;
                        case 'arena':
                            roleId = '1329947818189652008';
                            roleName = 'Arena Breakout';
                            break;
                        case 'pubg':
                            roleId = '1329948264824569927';
                            roleName = 'PUBG';
                            break;
                        case 'feign':
                            roleId = '1329948767570497646';
                            roleName = 'Feign';
                            break;
                        case 'tft':
                            roleId = '1329948900538454027';
                            roleName = 'TFT';
                            break;
                        case 'mirai':
                            roleId = '1330703863782838303';
                            roleName = 'Mirai';
                            break;
                        case 'roblox':
                            roleId = '1333773784959946803';
                            roleName = 'Roblox';
                            break;
                    }

                    try {
                        const role = interaction.guild.roles.cache.get(roleId);
                        if (role) {
                            if (member.roles.cache.has(role.id)) {
                                await member.roles.remove(role);
                                await interaction.reply({
                                    content: `✅ ${roleName} rolü kaldırıldı!`,
                                    ephemeral: true
                                });
                            } else {
                                await member.roles.add(role);
                                await interaction.reply({
                                    content: `✅ ${roleName} rolü verildi!`,
                                    ephemeral: true
                                });
                            }
                        } else {
                            await interaction.reply({
                                content: '❌ Rol bulunamadı!',
                                ephemeral: true
                            });
                        }
                    } catch (error) {
                        console.error('Rol işlemi hatası:', error);
                        await interaction.reply({
                            content: '❌ Rol işlemi sırasında bir hata oluştu!',
                            ephemeral: true
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Genel hata:', error);
            try {
                await interaction.reply({
                    content: '❌ Bir hata oluştu, lütfen daha sonra tekrar deneyin.',
                    ephemeral: true
                });
            } catch (err) {
                console.error('Hata bildirimi gönderilemedi:', err);
            }
        }
    });

    // Mesaj XP sistemi
    client.on('messageCreate', async message => {
        if (message.author.bot) return;
        
        // Rol kontrolü
        if (!hasRequiredRole(message.member)) return;

        const now = Date.now();
        const userData = getUserData(message.author.id);
        
        if (!userData.last_xp_time || now - userData.last_xp_time >= XP_SETTINGS.XP_COOLDOWN) {
            userData.xp += XP_SETTINGS.MESSAGE_XP;
            userData.last_xp_time = now;
            updateUserData(message.author.id, userData);
        }
    });

    // Yardımcı fonksiyonlar
    function formatTime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days} gün ${hours % 24} saat`;
        if (hours > 0) return `${hours} saat ${minutes % 60} dakika`;
        if (minutes > 0) return `${minutes} dakika`;
        return `${seconds} saniye`;
    }

    // İlerleme çubuğu oluşturma fonksiyonu
    function getProgressBar(current, max) {
        const percentage = Math.min(Math.max(current / max, 0), 1);
        const filled = Math.round(percentage * 10);
        const empty = 10 - filled;
        return '█'.repeat(filled) + '░'.repeat(empty);
    }

    // Seviye hesaplama fonksiyonu
    function calculateLevel(xp) {
        return Math.floor(Math.log2(xp / 50000 + 1)) + 1;
    }

    // Gerekli XP hesaplama fonksiyonu
    function calculateRequiredXP(level) {
        return (Math.pow(2, level - 1) - 1) * 50000;
    }

    client.login(process.env.COMMAND_BOT_TOKEN); 
