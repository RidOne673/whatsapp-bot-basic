const {
    default: makeWASocket,
    makeInMemoryStore,
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const fs = require('fs');
const readline = require('readline');
const chalk = require('chalk');

const funct = require('./utils/socket');

// Fungsi untuk input dari user
const question = (query) => new Promise((resolve) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    rl.question(query, (answer) => {
        rl.close();
        resolve(answer);
    });
});

const startBot = async () => {
    const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) });
    const { state, saveCreds } = await useMultiFileAuthState(`./session`);
    const { version, isLatest } = await fetchLatestBaileysVersion(); // Tidak lagi undefined

    const connectionOptions = {
        version,
        keepAliveIntervalMs: 30000,
        logger: pino({ level: "silent" }),
        auth: state,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        getMessage: async (key) => {
            const msg = await store.loadMessage(key.remoteJid, key.id, undefined);
            return msg?.message || { conversation: 'WhatsApp Bot' };
        }
    };

    socket = funct.makeWASocket(connectionOptions);

    // Pairing menggunakan kode
    if (!socket.authState.creds.registered) {
        const phoneNumber = await question(chalk.green('Masukkan nomor WhatsApp Anda awali dengan 62xxx: '));
        const sanitizedPhone = phoneNumber.replace(/[^0-9]/g, '');
        const pairingCode = await socket.requestPairingCode(sanitizedPhone.trim());
        const formattedCode = pairingCode?.match(/.{1,4}/g)?.join("-") || pairingCode;
        console.log(chalk.green(`Kode Pairing Anda: `), chalk.white(formattedCode));
    }

    // Simpan kredensial ketika diperbarui
    socket.ev.on('creds.update', saveCreds);
    store.bind(socket.ev);

    socket.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            if (reason === DisconnectReason.badSession) {
                console.log('Sesi buruk, silakan hapus folder ./session dan pairing ulang.');
                fs.rmdirSync('./session', { recursive: true });
                process.exit();
            } else if (reason === DisconnectReason.connectionClosed) {
                console.log('Koneksi ditutup, mencoba menghubungkan ulang...');
                startBot();
            } else if (reason === DisconnectReason.loggedOut) {
                console.log('Logged out, silakan pairing ulang.');
                fs.rmdirSync('./session', { recursive: true });
                process.exit();
            }
        } else if (connection === 'open') {
            console.log('Bot berhasil terhubung ke WhatsApp!');
        }
    });

    socket.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            m = chatUpdate.messages[0];
            m = funct.smsg(socket, m, store)
            if (!m.message) return;
            const text = m.message.conversation;
            const from = m.key.remoteJid;
            console.log(`Pesan baru dari ${from}: ${text}`);

            // Respon otomatis
            if (text === 'halo') {
                await socket.sendMessage(from, { text: 'Hai, ada yang bisa saya bantu?' });
            }
            // Tambahkan respon otomatis lainnya di sini
        } catch (err) {
            console.log('Error dalam penanganan pesan: ', err);
        }
    });

    store.bind(socket.ev);
};

// Memulai bot
startBot();