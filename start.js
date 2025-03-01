const { spawn } = require('child_process');
const path = require('path');

console.log('Bot başlatılıyor...');

// Bot'u başlat
const simpleBot = spawn('node', ['simpleBot.js'], {
    stdio: 'inherit',
    shell: true
});

// Hata yönetimi
simpleBot.on('error', (error) => {
    console.error('Bot Hatası:', error);
});

// Çıkış yönetimi
process.on('SIGINT', () => {
    console.log('Bot kapatılıyor...');
    simpleBot.kill();
    process.exit();
});

// Yeniden başlatma durumunda
simpleBot.on('close', (code) => {
    if (code !== 0) {
        console.log(`Bot kapandı. Yeniden başlatılıyor...`);
        spawn('node', ['simpleBot.js'], {
            stdio: 'inherit',
            shell: true
        });
    }
});

commandBot.on('close', (code) => {
    if (code !== 0) {
        console.log(`Komut Bot kapandı. Yeniden başlatılıyor...`);
        spawn('node', ['commandBot.js'], {
            stdio: 'inherit',
            shell: true
        });
    }
}); 
