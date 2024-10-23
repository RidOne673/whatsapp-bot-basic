const crypto = require("crypto");
const {
    default: makeWASocket,
    makeInMemoryStore,
    proto,
    downloadContentFromMessage,
    getBinaryNodeChild,
    jidDecode,
    areJidsSameUser,
    generateWAMessage,
    generateForwardMessageContent,
    generateWAMessageFromContent,
    WAMessageStubType,
    getContentType
} = require('@whiskeysockets/baileys');
const pino = require('pino');

const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) })
const makeid = crypto.randomBytes(3).toString('hex')

exports.makeWASocket = (connectionOptions, options = {}) => {
    const socket = makeWASocket(connectionOptions)
    
    socket.inspectLink = async (code) => {
            const extractGroupInviteMetadata = (content) => {
            const group = getBinaryNodeChild(content, "group");
            const descChild = getBinaryNodeChild(group, "description");
            let desc, descId;
            if (descChild) {
            desc = getBinaryNodeChild(descChild, "body").content.toString();
            descId = descChild.attrs.id;
            }
            const groupId = group.attrs.id.includes("@") ? group.attrs.id : group.attrs.id + "@g.us";
            const metadata = {
            id: groupId,
            subject: group.attrs.subject || "Tidak ada",
            creator: group.attrs.creator || "Tidak terdeteksi",
            creation: group.attrs.creation || "Tidak terdeteksi",
            desc,
            descId,
            };
            return metadata;
            }
            let results = await socket.query({
            tag: "iq",
            attrs: {
            type: "get",
            xmlns: "w:g2",
            to: "@g.us",
            },
            content: [{ tag: "invite", attrs: { code } }],
            });
            return extractGroupInviteMetadata(results);
    }
    
    function updateNameToDb(contacts) {
            if (!contacts) return
            for (let contact of contacts) {
            let id = socket.decodeJid(contact.id)
            if (!id) continue
            let chats = socket.contacts[id]
            if (!chats) chats = { id }
            let chat = {
            ...chats,
            ...({
            ...contact, id, ...(id.endsWith('@g.us') ?
            { subject: contact.subject || chats.subject || '' } :
            { name: contact.notify || chats.name || chats.notify || '' })
            } || {})
            }
            socket.contacts[id] = chat
            }
    }
    
    socket.ev.on('contacts.upsert', updateNameToDb)
    socket.ev.on('groups.update', updateNameToDb)
    
    socket.loadMessage = (messageID) => {
            return Object.entries(socket.chats)
            .filter(([_, { messages }]) => typeof messages === 'object')
            .find(([_, { messages }]) => Object.entries(messages)
            .find(([k, v]) => (k === messageID || v.key?.id === messageID)))
            ?.[1].messages?.[messageID]
    }
    
    socket.decodeJid = (jid) => {
            if (!jid) return jid
            if (/:\d+@/gi.test(jid)) {
            let decode = jidDecode(jid) || {}
            return decode.user && decode.server && decode.user + '@' + decode.server || jid
            } else return jid
    }
    
    if (socket.user && socket.user.id) socket.user.jid = socket.decodeJid(socket.user.id)
    socket.chats = {}
    socket.contacts = {}
    
    socket.sendMessageV2 = async (chatId, message, options = {}) => {
            let generate = await generateWAMessage(chatId, message, options)
            let type2 = getContentType(generate.message)
            if ('contextInfo' in options) generate.message[type2].contextInfo = options?.contextInfo
            if ('contextInfo' in message) generate.message[type2].contextInfo = message?.contextInfo
            return await socket.relayMessage(chatId, generate.message, { messageId: generate.key.id })
    }
    
    socket.logger = {
            ...socket.logger,
            info(...args) { console.log(chalk.bold.rgb(57, 183, 16)(`INFO [${chalk.rgb(255, 255, 255)(new Date())}]:`), chalk.cyan(...args)) },
            error(...args) { console.log(chalk.bold.rgb(247, 38, 33)(`ERROR [${chalk.rgb(255, 255, 255)(new Date())}]:`), chalk.rgb(255, 38, 0)(...args)) },
            warn(...args) { console.log(chalk.bold.rgb(239, 225, 3)(`WARNING [${chalk.rgb(255, 255, 255)(new Date())}]:`), chalk.keyword('orange')(...args)) }
    }
       
    socket.getFile = async (PATH, returnAsFilename) => {
            let res, filename
            let data = Buffer.isBuffer(PATH) ? PATH : /^data:.*?\/.*?;base64,/i.test(PATH) ? Buffer.from(PATH.split`,`[1], 'base64') : /^https?:\/\//.test(PATH) ? await (res = await fetch(PATH)).buffer() : fs.existsSync(PATH) ? (filename = PATH, fs.readFileSync(PATH)) : typeof PATH === 'string' ? PATH : Buffer.alloc(0)
            if (!Buffer.isBuffer(data)) throw new TypeError('Result is not a buffer')
            let type = await FileType.fromBuffer(data) || {
            mime: 'application/octet-stream',
            ext: '.bin'
            }
            if (data && returnAsFilename && !filename) (filename = path.join(__dirname, '../tmp/' + new Date * 1 + '.' + type.ext), await fs.promises.writeFile(filename, data))
            return {
            res,
            filename,
            ...type,
            data
            }
    }
    
    socket.waitEvent = (eventName, is = () => true, maxTries = 25) => {
            return new Promise((resolve, reject) => {
            let tries = 0
            let on = (...args) => {
            if (++tries > maxTries) reject('Max tries reached')
            else if (is()) {
            socket.ev.off(eventName, on)
            resolve(...args)
            }
            }
            socket.ev.on(eventName, on)
            })
    }
    
    socket.sendMedia = async (jid, path, quoted, options = {}) => {
            let { ext, mime, data } = await socket.getFile(path)
            messageType = mime.split("/")[0]
            pase = messageType.replace('application', 'document') || messageType
            return await socket.sendMessage(jid, { [`${pase}`]: data, mimetype: mime, ...options }, { quoted })
    }
    
    socket.sendContact = async (jid, kon, desk = "Developer Bot", quoted = '', opts = {}) => {
    let list = []
    for (let i of kon) {
    list.push({
    displayName: namaowner,
      vcard: 'BEGIN:VCARD\n' +
        'VERSION:3.0\n' +
        `N:;${namaowner};;;\n` +
        `FN:${namaowner}\n` +
        'ORG:null\n' +
        'TITLE:\n' +
        `item1.TEL;waid=${i}:${i}\n` +
        'item1.X-ABLabel:Ponsel\n' +
        `X-WA-BIZ-DESCRIPTION:${desk}\n` +
        `X-WA-BIZ-NAME:${namaowner}\n` +
        'END:VCARD'
    })
    }
    socket.sendMessage(jid, { contacts: { displayName: `${list.length} Kontak`, contacts: list }, ...opts }, { quoted })
    }

    socket.sendListMessage = async (jid, body, header, footer, title, rows = []) => {
        let params = {
            "title": title, "sections": [
                {
                    "title": "Pilih salah satu.", "rows": rows
                }
            ]
        }
        let msg = generateWAMessageFromContent(jid, {
            viewOnceMessage: {
                message: {
                    "messageContextInfo": {
                      "deviceListMetadata": {},
                      "deviceListMetadataVersion": 2
                    },
                    interactiveMessage: proto.Message.InteractiveMessage.create({
                      body: proto.Message.InteractiveMessage.Body.create({
                        text: body
                      }),
                      footer: proto.Message.InteractiveMessage.Footer.create({
                        text: footer
                      }),
                      header: proto.Message.InteractiveMessage.Header.create({
                        title: header,
                        subtitle: "subtittle",
                        hasMediaAttachment: false
                      }),
                      nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                        buttons: [
                          {
                            "name": "single_select",
                            "buttonParamsJson": JSON.stringify(params)
                          }
                       ],
                      })
                    })
                }
              }
          }, {})
           
          await socket.relayMessage(msg.key.remoteJid, msg.message, {
            messageId: msg.key.id,
            quoted: jid
          })
    }
    
    socket.setStatus = async (status) => {
            return await socket.query({
            tag: 'iq',
            attrs: {
            to: 's.whatsapp.net',
            type: 'set',
            xmlns: 'status',
            },
            content: [
            {
            tag: 'status',
            attrs: {},
            content: Buffer.from(status, 'utf-8')
            }
            ]
            })
    }
    
    socket.reply = (jid, text = '', quoted, options) => {
            return Buffer.isBuffer(text) ? this.sendFile(jid, text, 'file', '', quoted, false, options) : socket.sendMessage(jid, { ...options, text }, { quoted, ...options })
    }
    
    socket.sendStimg = async (jid, path, quoted, options = {}) => {
            let buff = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (await fetch(path)).buffer() : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
            let buffer
            if (options && (options.packname || options.author)) {
                buffer = await writeExifImg(buff, options)
            } else {
                buffer = await imageToWebp(buff)
            }
            await socket.sendMessage(jid, { sticker: { url: buffer }, ...options }, { quoted })
            return buffer
    }
        
    socket.sendStvid = async (jid, path, quoted, options = {}) => {
            let buff = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await getBuffer(path) : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
            let buffer
            if (options && (options.packname || options.author)) {
                buffer = await writeExifVid(buff, options)
            } else {
                buffer = await videoToWebp(buff)
            }
            await socket.sendMessage(jid, { sticker: { url: buffer }, ...options }, { quoted })
            return buffer
    }
    
    socket.sendGroupV4Invite = async(jid, participant, inviteCode, inviteExpiration, groupName = 'unknown subject', caption = 'Invitation to join my WhatsApp group', options = {}) => {
            let msg = proto.Message.fromObject({
            groupInviteMessage: proto.GroupInviteMessage.fromObject({
            inviteCode,
            inviteExpiration: parseInt(inviteExpiration) || + new Date(new Date + (3 * 86400000)),
            groupJid: jid,
            groupName: groupName ? groupName : this.getName(jid),
            caption
            })
            })
            let message = await this.prepareMessageFromContent(participant, msg, options)
            await this.relayWAMessage(message)
            return message
    }
    
    socket.cMod = async (jid, message, text = '', sender = socket.user.jid, options = {}) => {
            if (options.mentions && !Array.isArray(options.mentions)) options.mentions = [options.mentions]
            let copy = message.toJSON()
            delete copy.message.messageContextInfo
            delete copy.message.senderKeyDistributionMessage
            let mtype = Object.keys(copy.message)[0]
            let msg = copy.message
            let content = msg[mtype]
            if (typeof content === 'string') msg[mtype] = text || content
            else if (content.caption) content.caption = text || content.caption
            else if (content.text) content.text = text || content.text
            if (typeof content !== 'string') {
            msg[mtype] = { ...content, ...options }
            msg[mtype].contextInfo = {
            ...(content.contextInfo || {}),
            mentionedJid: options.mentions || content.contextInfo?.mentionedJid || []
            }
            }
            if (copy.participant) sender = copy.participant = sender || copy.participant
            else if (copy.key.participant) sender = copy.key.participant = sender || copy.key.participant
            if (copy.key.remoteJid.includes('@s.whatsapp.net')) sender = sender || copy.key.remoteJid
            else if (copy.key.remoteJid.includes('@broadcast')) sender = sender || copy.key.remoteJid
            copy.key.remoteJid = jid
            copy.key.fromMe = areJidsSameUser(sender, socket.user.id) || false
            return proto.WebMessageInfo.fromObject(copy)
    }
        
    socket.copyNForward = async (jid, message, forwardingScore = true, options = {}) => {
            let m = generateForwardMessageContent(message, !!forwardingScore)
            let mtype = Object.keys(m)[0]
            if (forwardingScore && typeof forwardingScore == 'number' && forwardingScore > 1) m[mtype].contextInfo.forwardingScore += forwardingScore
            m = generateWAMessageFromContent(jid, m, { ...options, userJid: socket.user.id })
            await socket.relayMessage(jid, m.message, { messageId: m.key.id, additionalAttributes: { ...options } })
            return m
    }
        
    socket.downloadM = async (m, type, filename = '') => {
            if (!m || !(m.url || m.directPath)) return Buffer.alloc(0)
            const stream = await downloadContentFromMessage(m, type)
            let buffer = Buffer.from([])
            for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk])
            }
            if (filename) await fs.promises.writeFile(filename, buffer)
            return filename && fs.existsSync(filename) ? filename : buffer
    }
        
    socket.downloadMed = async (message, filename, attachExtension = true) => {
            let mime = (message.msg || message).mimetype || ''
            let messageType = mime.split('/')[0].replace('application', 'document') ? mime.split('/')[0].replace('application', 'document') : mime.split('/')[0]
            const stream = await downloadContentFromMessage(message, messageType)
            let buffer = Buffer.from([])
            for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk])
            }
            let type = await FileType.fromBuffer(buffer)
            let trueFileName = attachExtension ? ('./all/tmp/' + makeid + '.' + type.ext) : filename
            await fs.writeFileSync(trueFileName, buffer)
    return trueFileName
    }
    
    socket.chatRead = async (jid, participant, messageID) => {
            return await socket.sendReadReceipt(jid, participant, [messageID])
    }
    
    socket.parseMention = (text = '') => {
            return [...text.matchAll(/@([0-9]{5,16}|0)/g)].map(v => v[1] + '@s.whatsapp.net')
    }
    
    socket.saveName = async (id, name = '') => {
            if (!id) return
            id = socket.decodeJid(id)
            let isGroup = id.endsWith('@g.us')
            if (id in socket.contacts && socket.contacts[id][isGroup ? 'subject' : 'name'] && id in socket.chats) return
            let metadata = {}
            if (isGroup) metadata = await socket.groupMetadata(id)
            let chat = { ...(socket.contacts[id] || {}), id, ...(isGroup ? { subject: metadata.subject, desc: metadata.desc } : { name }) }
            socket.contacts[id] = chat
            socket.chats[id] = chat
    }
    
    socket.getName = async (jid = '', withoutContact = false) => {
            jid = socket.decodeJid(jid)
            withoutContact = socket.withoutContact || withoutContact
            let v
            if (jid.endsWith('@g.us')) return new Promise(async (resolve) => {
            v = socket.chats[jid] || {}
            if (!(v.name || v.subject)) v = await socket.groupMetadata(jid) || {}
            resolve(v.name || v.subject || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international'))
            })
            else v = jid === '0@s.whatsapp.net' ? {
            jid,
            vname: 'WhatsApp'
            } : areJidsSameUser(jid, socket.user.id) ?
            socket.user :
            (socket.chats[jid] || {})
            return (withoutContact ? '' : v.name) || v.subject || v.vname || v.notify || v.verifiedName || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international').replace(new RegExp("[()+-/ +/]", "gi"), "") 
    }
        
    socket.processMessageStubType = async(m) => {
            if (!m.messageStubType) return
            const chat = socket.decodeJid(m.key.remoteJid || m.message?.senderKeyDistributionMessage?.groupId || '')
            if (!chat || chat === 'status@broadcast') return
            const emitGroupUpdate = (update) => {
            ev.emit('groups.update', [{ id: chat, ...update }])
            }
            switch (m.messageStubType) {
            case WAMessageStubType.REVOKE:
            case WAMessageStubType.GROUP_CHANGE_INVITE_LINK:
            emitGroupUpdate({ revoke: m.messageStubParameters[0] })
            break
            case WAMessageStubType.GROUP_CHANGE_ICON:
            emitGroupUpdate({ icon: m.messageStubParameters[0] })
            break
            default: {
            console.log({
            messageStubType: m.messageStubType,
            messageStubParameters: m.messageStubParameters,
            type: WAMessageStubType[m.messageStubType]
            })
            break
            }
            }
            const isGroup = chat.endsWith('@g.us')
            if (!isGroup) return
            let chats = socket.chats[chat]
            if (!chats) chats = socket.chats[chat] = { id: chat }
            chats.isChats = true
            const metadata = await socket.groupMetadata(chat).catch(_ => null)
            if (!metadata) return
            chats.subject = metadata.subject
            chats.metadata = metadata
    }
    
    socket.insertAllGroup = async() => {
            const groups = await socket.groupFetchAllParticipating().catch(_ => null) || {}
            for (const group in groups) socket.chats[group] = { ...(socket.chats[group] || {}), id: group, subject: groups[group].subject, isChats: true, metadata: groups[group] }
            return socket.chats
    }
    
    socket.pushMessage = async(m) => {
            if (!m) return
            if (!Array.isArray(m)) m = [m]
            for (const message of m) {
            try {
            if (!message) continue
            if (message.messageStubType && message.messageStubType != WAMessageStubType.CIPHERTEXT) socket.processMessageStubType(message).catch(console.error)
            const _mtype = Object.keys(message.message || {})
            const mtype = (!['senderKeyDistributionMessage', 'messageContextInfo'].includes(_mtype[0]) && _mtype[0]) ||
            (_mtype.length >= 3 && _mtype[1] !== 'messageContextInfo' && _mtype[1]) ||
            _mtype[_mtype.length - 1]
            const chat = socket.decodeJid(message.key.remoteJid || message.message?.senderKeyDistributionMessage?.groupId || '')
            if (message.message?.[mtype]?.contextInfo?.quotedMessage) {
            let context = message.message[mtype].contextInfo
            let participant = socket.decodeJid(context.participant)
            const remoteJid = socket.decodeJid(context.remoteJid || participant)
            let quoted = message.message[mtype].contextInfo.quotedMessage
            if ((remoteJid && remoteJid !== 'status@broadcast') && quoted) {
            let qMtype = Object.keys(quoted)[0]
            if (qMtype == 'conversation') {
            quoted.extendedTextMessage = { text: quoted[qMtype] }
            delete quoted.conversation
            qMtype = 'extendedTextMessage'
            }
            if (!quoted[qMtype].contextInfo) quoted[qMtype].contextInfo = {}
            quoted[qMtype].contextInfo.mentionedJid = context.mentionedJid || quoted[qMtype].contextInfo.mentionedJid || []
            const isGroup = remoteJid.endsWith('g.us')
            if (isGroup && !participant) participant = remoteJid
            const qM = {
            key: {
            remoteJid,
            fromMe: areJidsSameUser(socket.user.jid, remoteJid),
            id: context.stanzaId,
            participant,
            },
            message: JSON.parse(JSON.stringify(quoted)),
            ...(isGroup ? { participant } : {})
            }
            let qChats = socket.chats[participant]
            if (!qChats) qChats = socket.chats[participant] = { id: participant, isChats: !isGroup }
            if (!qChats.messages) qChats.messages = {}
            if (!qChats.messages[context.stanzaId] && !qM.key.fromMe) qChats.messages[context.stanzaId] = qM
            let qChatsMessages
            if ((qChatsMessages = Object.entries(qChats.messages)).length > 40) qChats.messages = Object.fromEntries(qChatsMessages.slice(30, qChatsMessages.length)) // maybe avoid memory leak
            }
            }
            if (!chat || chat === 'status@broadcast') continue
            const isGroup = chat.endsWith('@g.us')
            let chats = socket.chats[chat]
            if (!chats) {
            if (isGroup) await socket.insertAllGroup().catch(console.error)
            chats = socket.chats[chat] = { id: chat, isChats: true, ...(socket.chats[chat] || {}) }
            }
            let metadata, sender
            if (isGroup) {
            if (!chats.subject || !chats.metadata) {
            metadata = await socket.groupMetadata(chat).catch(_ => ({})) || {}
            if (!chats.subject) chats.subject = metadata.subject || ''
            if (!chats.metadata) chats.metadata = metadata
            }
            sender = socket.decodeJid(message.key?.fromMe && socket.user.id || message.participant || message.key?.participant || chat || '')
            if (sender !== chat) {
            let chats = socket.chats[sender]
            if (!chats) chats = socket.chats[sender] = { id: sender }
            if (!chats.name) chats.name = message.pushName || chats.name || ''
            }
            } else if (!chats.name) chats.name = message.pushName || chats.name || ''
            if (['senderKeyDistributionMessage', 'messageContextInfo'].includes(mtype)) continue
            chats.isChats = true
            if (!chats.messages) chats.messages = {}
            const fromMe = message.key.fromMe || areJidsSameUser(sender || chat, socket.user.id)
            if (!['protocolMessage'].includes(mtype) && !fromMe && message.messageStubType != WAMessageStubType.CIPHERTEXT && message.message) {
            delete message.message.messageContextInfo
            delete message.message.senderKeyDistributionMessage
            chats.messages[message.key.id] = JSON.parse(JSON.stringify(message, null, 2))
            let chatsMessages
            if ((chatsMessages = Object.entries(chats.messages)).length > 40) chats.messages = Object.fromEntries(chatsMessages.slice(30, chatsMessages.length))
            }
            } catch (e) {
            console.error(e)
            }
            }
    }
        
    socket.getBusinessProfile = async (jid) => {
            const results = await socket.query({
            tag: 'iq',
            attrs: {
            to: 's.whatsapp.net',
            xmlns: 'w:biz',
            type: 'get'
            },
            content: [{
            tag: 'business_profile',
            attrs: { v: '244' },
            content: [{
            tag: 'profile',
            attrs: { jid }
            }]
            }]
            })
            const profiles = getBinaryNodeChild(getBinaryNodeChild(results, 'business_profile'), 'profile')
            if (!profiles) return {} // if not bussines
            const address = getBinaryNodeChild(profiles, 'address')
            const description = getBinaryNodeChild(profiles, 'description')
            const website = getBinaryNodeChild(profiles, 'website')
            const email = getBinaryNodeChild(profiles, 'email')
            const category = getBinaryNodeChild(getBinaryNodeChild(profiles, 'categories'), 'category')
            return {
            jid: profiles.attrs?.jid,
            address: address?.content.toString(),
            description: description?.content.toString(),
            website: website?.content.toString(),
            email: email?.content.toString(),
            category: category?.content.toString(),
            }
    }
    
    socket.msToDate = (ms) => {
            let days = Math.floor(ms / (24 * 60 * 60 * 1000))
            let daysms = ms % (24 * 60 * 60 * 1000)
            let hours = Math.floor((daysms) / (60 * 60 * 1000))
            let hoursms = ms % (60 * 60 * 1000)
            let minutes = Math.floor((hoursms) / (60 * 1000))
            let minutesms = ms % (60 * 1000)
            let sec = Math.floor((minutesms) / (1000))
            return days + " Hari " + hours + " Jam " + minutes + " Menit"
    }
        
    socket.msToTime = (ms) => {
            let h = isNaN(ms) ? '--' : Math.floor(ms / 3600000)
            let m = isNaN(ms) ? '--' : Math.floor(ms / 60000) % 60
            let s = isNaN(ms) ? '--' : Math.floor(ms / 1000) % 60
            return [h + ' Jam ', m + ' Menit ', s + ' Detik'].map(v => v.toString().padStart(2, 0)).join(' ')
    }
        
    socket.msToHour = (ms) => {
            let h = isNaN(ms) ? '--' : Math.floor(ms / 3600000)
            return [h + ' Jam '].map(v => v.toString().padStart(2, 0)).join(' ')
    }
        
    socket.msToMinute = (ms) => {
            let m = isNaN(ms) ? '--' : Math.floor(ms / 60000) % 60
            return [m + ' Menit '].map(v => v.toString().padStart(2, 0)).join(' ')
    }
        
    socket.msToSecond = (ms) => {
            let s = isNaN(ms) ? '--' : Math.floor(ms / 1000) % 60
            return [s + ' Detik'].map(v => v.toString().padStart(2, 0)).join(' ')
    }
    
    socket.clockString = (ms) => {
            let h = isNaN(ms) ? '--' : Math.floor(ms / 3600000)
            let m = isNaN(ms) ? '--' : Math.floor(ms / 60000) % 60
            let s = isNaN(ms) ? '--' : Math.floor(ms / 1000) % 60
            return [h + ' Jam ', m + ' Menit ', s + ' Detik'].map(v => v.toString().padStart(2, 0)).join(' ')
    }
        
    socket.join = (arr) => {
            let construct = []
            for (let i = 0; i < arr.length; i++) {
            construct = construct.concat(arr[i])
            }
            return construct
    }
    
    socket.pickRandom = (list) => {
            return list[Math.floor(list.length * Math.random())]
    }
    
    socket.delay = (ms) => {
            return new Promise((resolve, reject) => setTimeout(resolve, ms))
    }
    
    socket.filter = (text) => {
            let mati = ["q", "w", "r", "t", "y", "p", "s", "d", "f", "g", "h", "j", "k", "l", "z", "x", "c", "v", "b", "n", "m"]
            if (/[aiueo][aiueo]([qwrtypsdfghjklzxcvbnm])?$/i.test(text)) return text.substring(text.length - 1)
            else {
            let res = Array.from(text).filter(v => mati.includes(v))
            let resu = res[res.length - 1]
            for (let huruf of mati) {
            if (text.endsWith(huruf)) {
            resu = res[res.length - 2]
            }
            }
            let misah = text.split(resu)
            return resu + misah[misah.length - 1]
            }
    }
    
    socket.format = (...args) => {
            return util.format(...args)
    }
        
    socket.serializeM = (m) => {
            return exports.smsg(socket, m)
    }
    
    socket.sendText = (jid, text, quoted = '', options) => socket.sendMessage(jid, { text: text, ...options }, { quoted })
        
    socket.sendImage = async (jid, path, caption = '', setquoted, options) => {
            let buffer = Buffer.isBuffer(path) ? path : await getBuffer(path)
            return await socket.sendMessage(jid, { image: buffer, caption: caption, ...options }, { quoted : setquoted})
    }
        
    socket.sendVideo = async (jid, yo, caption = '', quoted = '', gif = false, options) => {
            return await socket.sendMessage(jid, { video: yo, caption: caption, gifPlayback: gif, ...options }, { quoted })
    }
        
    socket.sendAudio = async (jid, path, quoted = '', ptt = false, options) => {
            let buffer = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (await getBuffer(path)) : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
            return await socket.sendMessage(jid, { audio: buffer, ptt: ptt, ...options }, { quoted })
    }
        
    socket.sendTextWithMentions = async (jid, text, quoted, options = {}) => socket.sendMessage(jid, { text: text, contextInfo: { mentionedJid: [...text.matchAll(/@(\d{0,16})/g)].map(v => v[1] + '@s.whatsapp.net') }, ...options }, { quoted })
        
    socket.sendGroupV4Invite = async(jid, participant, inviteCode, inviteExpiration, groupName = 'unknown subject', jpegThumbnail, caption = 'Invitation to join my WhatsApp group', options = {}) => {
            let msg = WAProto.Message.fromObject({
            groupInviteMessage: WAProto.GroupInviteMessage.fromObject({
            inviteCode,
            inviteExpiration: inviteExpiration ? parseInt(inviteExpiration) : + new Date(new Date + (3 * 86400000)),
            groupJid: jid,
            groupName: groupName ? groupName : (await socket.groupMetadata(jid)).subject,
            jpegThumbnail: jpegThumbnail ? (await getBuffer(jpegThumbnail)).buffer : '',
            caption
            })
            })
            const m = generateWAMessageFromContent(participant, msg, options)
            return await socket.relayMessage(participant, m.message, { messageId: m.key.id })
    }
    
    socket.sendPoll = async (jid, title = '', but = []) => {
            let pollCreation = generateWAMessageFromContent(jid,
            proto.Message.fromObject({
            pollCreationMessage: {
            name: title,
            options: but,
            selectableOptionsCount: but.length
            }}),
            { userJid: jid })
            return socket.relayMessage(jid, pollCreation.message, { messageId: pollCreation.key.id })
    }
    
    socket.sendOrder = async (jid, text, img, itcount, ammount, qnya = m) => {
    const order = generateWAMessageFromContent(jid, proto.Message.fromObject({
    "orderMessage": {
    "orderId": "65bh4ddqr90",
    "thumbnail": img,
    "itemCount": itcount,
    "status": "INQUIRY",
    "surface": "CATALOG",
    "orderTitle": "product",
    "message": text,
    "sellerJid": m.sender,
    "token": "775BBQR0",
    "totalAmount1000": ammount,
    "totalCurrencyCode": "IDR",
    "contextInfo": {
    "mentionedJid": [m.sender]
    }}
    }), { userJid: m.sender, quoted: qnya })
    return socket.relayMessage(jid, order.message, { messageId: order.key.id})
    }
    
    socket.downloadAndSaveMediaMessage = async (message, filename, attachExtension = true) => {
        let quoted = message.msg ? message.msg : message
        let mime = (message.msg || message).mimetype || ''
        let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0]
        const stream = await downloadContentFromMessage(quoted, messageType)
        let buffer = Buffer.from([])
        for await(const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk])
        }
        let type = await FileType.fromBuffer(buffer)
    
        trueFileName = attachExtension ? ('./all/tmp/' + makeid + '.' + type.ext) : filename
    await fs.writeFileSync(trueFileName, buffer)
    return trueFileName
    }
        
    socket.downloadMediaMessage = async (message) => {
        let mime = (message.msg || message).mimetype || ''
        let messageType = message.type ? message.type.replace(/Message/gi, '') : mime.split('/')[0]
        const stream = await downloadContentFromMessage(message, messageType)
        let buffer = Buffer.from([])
        for await(const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk])
        }
        return buffer
    } 
        
    
    Object.defineProperty(socket, 'name', {
    value: { ...(options.chats || {}) },
    configurable: true,
    })
    if (socket.user?.id) socket.user.jid = socket.decodeJid(socket.user.id)
    store.bind(socket.ev)
    return socket
}

exports.smsg = (socket, m, store) => {
    if (!m) return m
    let M = proto.WebMessageInfo
    var m = M.fromObject(m)
    if (m.key) {
        m.id = m.key.id
        m.isBaileys = m.id.startsWith('BAE5') && m.id.length === 16
        m.chat = m.key.remoteJid
        m.fromMe = m.key.fromMe
        m.isGroup = m.chat.endsWith('@g.us')
        m.sender = socket.decodeJid(m.fromMe && socket.user.id || m.participant || m.key.participant || m.chat || '')
        if (m.isGroup) m.participant = socket.decodeJid(m.key.participant) || ''
    }
	if (m.message) {
		m.mtype = getTypeMessage(m.message)
		m.msg = (m.mtype == 'viewOnceMessage' ? m.message[m.mtype].message[getTypeMessage(m.message[m.mtype].message)] : m.message[m.mtype])
//		m.body = m.message.conversation || m.msg.caption || m.msg.text || (m.mtype == 'listResponseMessage') && m.msg.singleSelectReply.selectedRowId || (m.mtype == 'buttonsResponseMessage') && m.msg.selectedButtonId || (m.mtype == 'viewOnceMessage') && m.msg.caption || m.tex // (m.mtype === 'conversation' && m.message.conversation) ? m.message.conversation : (m.mtype == 'imageMessage') && m.message.imageMessage.caption ? m.message.imageMessage.caption : (type == 'videoMessage') && m.message.videoMessage.caption ? m.message.videoMessage.caption : (m.mtype == 'extendedTextMessage') && m.message.extendedTextMessage.text ? m.message.extendedTextMessage.text : (m.mtype == 'listResponseMessage') && m.message.listResponseMessage.singleSelectReply.selectedRowId ? m.message.listResponseMessage.singleSelectReply.selectedRowId : (m.mtype == 'buttonsResponseMessage') && m.message.buttonsResponseMessage.selectedButtonId ? m.message.buttonsResponseMessage.selectedButtonId : (m.mtype == 'templateButtonReplyMessage') && m.message.templateButtonReplyMessage.selectedId ? m.message.templateButtonReplyMessage.selectedId : ''
		
		try {
			m.body =
				m.message.conversation ||
				m.message[m.type].text ||
				m.message[m.type].caption ||
				(m.type === "listResponseMessage" && m.message[m.type].singleSelectReply.selectedRowId) ||
				(m.type === "buttonsResponseMessage" &&
					m.message[m.type].selectedButtonId) ||
				(m.type === "templateButtonReplyMessage" && m.message[m.type].selectedId) ||
				"";
		} catch {
			m.body = "";
		}
		
		
		
		// t
		let quoted = m.quoted = m.msg.contextInfo ? m.msg.contextInfo.quotedMessage : null
		//m.mentionedJid = m.msg.contextInfo ? m.msg.contextInfo.mentionedJid : []
		m.mentionedJid = m.msg.contextInfo ? m.msg.contextInfo.mentionedJid : []
		if (m.quoted) {
			let type = Object.keys(quoted)[0]
			m.quoted = m.quoted[type]
			if (['productMessage'].includes(type)) {
				type = getContentType(m.quoted)
				m.quoted = m.quoted[type]
			}
			if (typeof m.quoted === 'string') m.quoted = {
				text: m.quoted
			}
			m.quoted.mtype = type
			m.quoted.id = m.msg.contextInfo.stanzaId
			m.quoted.chat = m.msg.contextInfo.remoteJid || m.chat
			m.quoted.isBaileys = m.quoted.id ? m.quoted.id.startsWith('BAE5') && m.quoted.id.length === 16 : false
			m.quoted.sender = socket.decodeJid(m.msg.contextInfo.participant)
			m.quoted.fromMe = m.quoted.sender === (socket.user && socket.user.jid)
			m.quoted.text = m.quoted.text || m.quoted.caption || m.quoted.conversation || m.quoted.contentText || m.quoted.selectedDisplayText || m.quoted.title || ''
			m.quoted.mentionedJid = m.quoted.contextInfo ? m.quoted.contextInfo.mentionedJid : []
			m.getQuotedObj = m.getQuotedMessage = async () => {
				if (!m.quoted.id) return false
				let q = await store.loadMessage(m.chat, m.quoted.id, socket)
				return exports.smsg(socket, q, store)
			}
			let vM = m.quoted.fakeObj = M.fromObject({
				key: {
					remoteJid: m.quoted.chat,
					fromMe: m.quoted.fromMe,
					id: m.quoted.id
				},
				message: quoted,
				...(m.isGroup ? {
					participant: m.quoted.sender
				} : {})
			})

			/**
			 * 
			 * @returns 
			 */
			m.quoted.delete = () => socket.sendMessage(m.quoted.chat, {
				delete: vM.key
			})

			/**
			 * 
			 * @param {*} jid 
			 * @param {*} forceForward 
			 * @param {*} options 
			 * @returns 
			 */
			m.quoted.copyNForward = (jid, forceForward = false, options = {}) => socket.copyNForward(jid, vM, forceForward, options)

			/**
			 *
			 * @returns
			 */
			m.quoted.download = () => socket.downloadMediaMessage(m.quoted)
		}
	}
    if (m.msg.url) m.download = () => socket.downloadMediaMessage(m.msg)
    m.text = m.msg.text || m.msg.caption || m.message.conversation || m.msg.contentText || m.msg.selectedDisplayText || m.msg.title || ''
    /**
	* Reply to this message
	* @param {String|Object} text 
	* @param {String|false} chatId 
	* @param {Object} options 
	*/
    m.reply = (text, chatId = m.chat, options = {}) => Buffer.isBuffer(text) ? socket.sendMedia(chatId, text, 'file', '', m, { ...options }) : socket.sendText(chatId, text, m, { ...options })
    /**
	* Copy this message
	*/
	m.copy = () => exports.smsg(socket, M.fromObject(M.toObject(m)))

	/**
	 * 
	 * @param {*} jid 
	 * @param {*} forceForward 
	 * @param {*} options 
	 * @returns 
	 */
	m.copyNForward = (jid = m.chat, forceForward = false, options = {}) => socket.copyNForward(jid, m, forceForward, options)

    return m
}

exports.logic = (check, inp, out) => {
    if (inp.length !== out.length) throw new Error('Input and Output must have same length')
    for (let i in inp) if (util.isDeepStrictEqual(check, inp[i])) return out[i]
    return null
}

exports.protoType = () => {
    Buffer.prototype.toArrayBuffer = function toArrayBufferV2() {
    const ab = new ArrayBuffer(this.length);
    const view = new Uint8Array(ab);
    for (let i = 0; i < this.length; ++i) {
    view[i] = this[i];
    }
    return ab;
}

Buffer.prototype.toArrayBufferV2 = function toArrayBuffer() {
    return this.buffer.slice(this.byteOffset, this.byteOffset + this.byteLength)
}

ArrayBuffer.prototype.toBuffer = function toBuffer() {
    return Buffer.from(new Uint8Array(this))
}

Uint8Array.prototype.getFileType = ArrayBuffer.prototype.getFileType = Buffer.prototype.getFileType = async function getFileType() {
    return await fileTypeFromBuffer(this)
}

String.prototype.isNumber = Number.prototype.isNumber = isNumber

String.prototype.capitalize = function capitalize() {
    return this.charAt(0).toUpperCase() + this.slice(1, this.length)
}

String.prototype.capitalizeV2 = function capitalizeV2() {
    const str = this.split(' ')
    return str.map(v => v.capitalize()).join(' ')
}

String.prototype.decodeJid = function decodeJid() {
    if (/:\d+@/gi.test(this)) {
    const decode = jidDecode(this) || {}
    return (decode.user && decode.server && decode.user + '@' + decode.server || this).trim()
    } else return this.trim()
}

Number.prototype.toTimeString = function toTimeString() {
    const seconds = Math.floor((this / 1000) % 60)
    const minutes = Math.floor((this / (60 * 1000)) % 60)
    const hours = Math.floor((this / (60 * 60 * 1000)) % 24)
    const days = Math.floor((this / (24 * 60 * 60 * 1000)))
    return (
    (days ? `${days} day(s) ` : '') +
    (hours ? `${hours} hour(s) ` : '') +
    (minutes ? `${minutes} minute(s) ` : '') +
    (seconds ? `${seconds} second(s)` : '')
    ).trim()
    }
    Number.prototype.getRandom = String.prototype.getRandom = Array.prototype.getRandom = getRandom
}

function isNumber() {
    const int = parseInt(this)
    return typeof int === 'number' && !isNaN(int)
}

function getRandom() {
    if (Array.isArray(this) || this instanceof String) return this[Math.floor(Math.random() * this.length)]
    return Math.floor(Math.random() * this)
}

function nullish(args) {
    return !(args !== null && args !== undefined)
}

function getTypeMessage(message) {
  	  const type = Object.keys(message)
			var restype =  (!['senderKeyDistributionMessage', 'messageContextInfo'].includes(type[0]) && type[0]) || // Sometimes message in the front
					(type.length >= 3 && type[1] !== 'messageContextInfo' && type[1]) || // Sometimes message in midle if mtype length is greater than or equal to 3
					type[type.length - 1] || Object.keys(message)[0] // common case
	return restype
}