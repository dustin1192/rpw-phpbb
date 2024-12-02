const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const mysql = require('mysql2/promise');
const fs = require('fs');
const config = require('../config.json');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

const syncFilePath = './sync.json';

function loadSyncData() {
    if (fs.existsSync(syncFilePath)) {
        return JSON.parse(fs.readFileSync(syncFilePath));
    } else {
        console.log('Файл синхронизации не найден. Используется пустой объект.');
        return {};
    }
}

function saveSyncData(data) {
    fs.writeFileSync(syncFilePath, JSON.stringify(data, null, 2));
}

let recentSyncs = [];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sync')
        .setDescription('Проверка OOC никнейма')
        .addStringOption(option =>
            option.setName('nickname')
                .setDescription('Ваш OOC никнейм')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('icname')
                .setDescription('Ваш IC никнейм')
                .setRequired(true)),
    async execute(interaction) {
        const nickname = interaction.options.getString('nickname');
        const icNickname = interaction.options.getString('icname');
        const discordTag = interaction.user.tag;
        const guild = interaction.guild;

        if (interaction.channelId !== config.verifyChannelId) {
            return interaction.editReply({ content: 'Синхронизация: эту команду можно использовать только в определённом канале.', ephemeral: true, flags: [ 4096 ] });
        }

        await interaction.deferReply({ ephemeral: true, flags: [ 4096 ] });

        try {
            const syncData = loadSyncData();

            if (!syncData[guild.id]?.pinnedMessageId) {
                return interaction.editReply({ content: 'Синхронизация: закреплённое сообщение не настроено. Используйте команду `/settings message` для создания сообщения, если у вас есть соответствующий доступ. ', ephemeral: true });
            }

            const [rows] = await pool.execute(
                `SELECT user_id FROM ${process.env.TABLE_PREFIX}profile_fields_data WHERE pf_ooc_nickname = ? AND pf_discord = ?`,
                [nickname, discordTag]
            );

            if (rows.length === 0) {
                return interaction.editReply({ content: 'Синхронизация: никнейм не найден или Discord-тег не совпадает, проверьте свои данные на форуме фракции.', ephemeral: true });
            }

            /*const isSynced = syncData[guild.id].users?.[discordTag];

            if (!isSynced && !icNickname) {
                return interaction.editReply({
                    content: 'Вы не синхронизированы. Укажите IC никнейм для синхронизации.',
                    ephemeral: true,
                });
            }*/


            const userId = rows[0].user_id;
            if (!syncData[guild.id]) {
                syncData[guild.id] = { users: {} };
            }

            if (!syncData[guild.id].users) {
                syncData[guild.id].users = {};
            }
            syncData[guild.id].users[discordTag] = userId;

            saveSyncData(syncData);

            const [groupRows] = await pool.execute(
                `SELECT group_id FROM ${process.env.TABLE_PREFIX}user_group WHERE user_id = ?`,
                [userId]
            );

            const member = await guild.members.fetch(interaction.user.id);
            const forumRoles = groupRows
                .map(row => syncData[guild.id]?.[row.group_id])
                .filter(roleId => roleId);

            const currentRoles = member.roles.cache.map(role => role.id);
            const rolesToAdd = forumRoles.filter(roleId => !currentRoles.includes(roleId));
            const rolesToRemove = currentRoles.filter(roleId => !forumRoles.includes(roleId) && syncData[guild.id] && Object.values(syncData[guild.id]).includes(roleId));

            if (rolesToAdd.length === 0 && rolesToRemove.length === 0) {
                return interaction.editReply({ content: 'Синхронизация: новых или удаленных ролей не найдено. Изменения не применены.' });
            }

            for (const roleId of rolesToAdd) {
                const role = guild.roles.cache.get(roleId);
                if (role) await member.roles.add(role);
            }

            for (const roleId of rolesToRemove) {
                const role = guild.roles.cache.get(roleId);
                if (role) await member.roles.remove(role);
            }

            //await member.setNickname(icNickname);

            recentSyncs.unshift({
                user: icNickname,
                added: rolesToAdd.map(roleId => {
                    const role = guild.roles.cache.get(roleId);
                    return {
                        name: role?.name || 'Неизвестно',
                        icon: role?.iconURL({ extension: 'png', size: 128 }) || null,
                    };
                }),
                removed: rolesToRemove.map(roleId => {
                    const role = guild.roles.cache.get(roleId);
                    return {
                        name: role?.name || 'Неизвестно',
                        icon: role?.iconURL({ extension: 'png', size: 128 }) || null,
                    };
                }),
            });

            if (recentSyncs.length > 5) recentSyncs = recentSyncs.slice(0, 5);

            const backgrounds = [
                'bg.png',
            ];
            const randomBackground = backgrounds[Math.floor(Math.random() * backgrounds.length)];

            const canvas = createCanvas(1920, 1080);
            const ctx = canvas.getContext('2d');
            const background = await loadImage(randomBackground);
            ctx.drawImage(background, 0, 0, canvas.width, canvas.height);


            ctx.fillStyle = '#ffffff';
            ctx.font = '34px Tahoma';
            ctx.fillText('POLICE.ROLEPLAYWORLD.RU', 940, 115);

            function fitText(ctx, text, maxWidth, fontSize) {
                ctx.font = `${fontSize}px Times New Roman`;
                while (ctx.measureText(text).width > maxWidth && fontSize > 10) {
                    fontSize -= 1;
                    ctx.font = `${fontSize}px Times New Roman`;
                }
                return { text, fontSize };
            }

            for (let i = 0; i < recentSyncs.length; i++) {
                const sync = recentSyncs[i];
                const y = 80 + i * 30;

                ctx.fillStyle = '#6c6c6c';
                ctx.font = '23px Times New Roman';
                ctx.fillText(sync.user, 590, y + 380);

                if (sync.added.length > 0) {
                    const roleX = 810;
                    const roleY = y + 380;
                    //const roleNames = sync.added.map(role => role.name).join(', ');
                    const roleNames = sync.added.slice(0, 2).map(role => role.name).join(', ');

                    ctx.fillStyle = '#6c6c6c';
                    const { text: fittedText, fontSize } = fitText(ctx, `${roleNames}`, 300, 20);
                    ctx.font = `${fontSize}px Times New Roman`;
                    ctx.fillText(fittedText, roleX, roleY);

                    sync.added.forEach(async (role, index) => {
                        if (role.icon) {
                            try {
                                const icon = await loadImage(role.icon);
                                ctx.drawImage(icon, roleX + index * 20 - 50, roleY - 15, 16, 16);
                            } catch (error) {
                                console.error(`Ошибка загрузки иконки для роли ${role.name}:`, error);
                            }
                        }
                    });
                }


                if (sync.removed.length > 0) {
                    const roleX = 1200;
                    const roleY = y + 380;
                    const roleNames = sync.removed.slice(0, 2).map(role => role.name).join(', ');

                    const { text: fittedText, fontSize } = fitText(ctx, `${roleNames}`, 300, 20);

                    ctx.fillStyle = '#6c6c6c';
                    ctx.font = `${fontSize}px Times New Roman`;
                    ctx.fillText(fittedText, roleX, roleY);

                    sync.removed.forEach(async (role, index) => {
                        if (role.icon) {
                            try {
                                const icon = await loadImage(role.icon);
                                ctx.drawImage(icon, roleX + index * 20 - 50, roleY - 15, 16, 16);
                            } catch (error) {
                                console.error(`Ошибка загрузки иконки для роли ${role.name}:`, error);
                            }
                        }
                    });
                }
            }

            const buffer = canvas.toBuffer();
            const attachment = new AttachmentBuilder(buffer, { name: 'syncs.png' });

            const channel = guild.channels.cache.get(config.verifyChannelId);
            const pinnedMessage = await channel.messages.fetch(syncData[guild.id].pinnedMessageId);

            const embed = new EmbedBuilder()
                .setTitle('Добро пожаловать!')
                .setDescription('Используйте команду `/sync [OOC никнейм] [IC никнейм]` для синхронизации ваших ролей на форуме с ролями в Discord. Обратите внимание, что в Вашем профиле на форуме должны быть заполнены следующие поля: `OOC никнейм; Discord`. Поле Discord должно совпадать с текущим. IC никнейм не обязателен, если ранее Вы уже синхронизировались. Если у Вас остались вопросы - обратитесь сюда.')
                .setColor('#303136')
                .setThumbnail('https://i.imgur.com/4LhIQRb.png')
                .setImage('attachment://syncs.png')
                .setFooter({ text: `Los Santos Police Department. Специально для RPW.` })

            await pinnedMessage.edit({ embeds: [embed], files: [attachment] });

            const embedreply = new EmbedBuilder()
                .setTitle('Синхронизация ролей')
                .setColor('#303136')
                .setDescription(`Роли пользователя были обновлены в соответствии с группами на форуме.`)
                .addFields(
                    {
                        name: 'Добавленные роли',
                        value: rolesToAdd.length > 0
                            ? rolesToAdd.map(roleId => `<@&${roleId}>`).join('; ')
                            : 'Нет',
                        inline: false,
                    },
                    {
                        name: 'Удалённые роли',
                        value: rolesToRemove.length > 0
                            ? rolesToRemove.map(roleId => `<@&${roleId}>`).join('; ')
                            : 'Нет',
                        inline: true,
                    }
                )
                .setFooter({ text: `Запрос выполнен для ${member.user.tag}` });

            await interaction.editReply({ embeds: [embedreply] });
        } catch (error) {
            console.error('Ошибка в SQL-запросе:', error);
            return interaction.editReply({ content: 'Ошибка при обращении к базе данных.', ephemeral: true, flags: [ 4096 ] });
        }
    },
};
