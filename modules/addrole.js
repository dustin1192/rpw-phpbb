const { SlashCommandBuilder } = require('discord.js');
const mysql = require('mysql2/promise');
const fs = require('fs');

const syncFilePath = './sync.json';

function loadSyncData() {
    if (fs.existsSync(syncFilePath)) {
        return JSON.parse(fs.readFileSync(syncFilePath, 'utf8'));
    } else {
        console.log('Файл синхронизации не найден. Используется пустой объект.');
        return {};
    }
}

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addrole')
        .setDescription('Добавить синхронизированную группу на форуме и роль в Discord')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Роль, которую нужно добавить')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('ooc_nickname')
                .setDescription('OOC никнейм пользователя')
                .setRequired(false))
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Упоминание пользователя')
                .setRequired(false)),
    async execute(interaction) {
        const oocNickname = interaction.options.getString('ooc_nickname');
        const userMention = interaction.options.getUser('user');
        const discordRole = interaction.options.getRole('role');
        const guild = interaction.guild;

        await interaction.deferReply({ ephemeral: false, flags: [ 4096 ] });

        try {
            const syncData = loadSyncData();

            if (!syncData[guild.id]) {
                return interaction.editReply({
                    content: 'Синхронизация для этого сервера не настроена.',
                    ephemeral: true,
                });
            }

            if (!oocNickname && !userMention) {
                return interaction.editReply({
                    content: 'Укажите либо OOC никнейм, либо упоминание пользователя.',
                    ephemeral: true,
                });
            }

            let userId;
            let userTag;

            //const discordTag = userMention ? userMention.tag : interaction.user.tag;

            /*if (!syncData[guild.id]?.users?.[discordTag]) {
                return interaction.editReply({
                    content: `Пользователь "${discordTag}" не привязан через синхронизацию.`,
                    ephemeral: true,
                });
            }*/

            if (oocNickname) {
                const [rows] = await pool.execute(
                    `SELECT user_id FROM ${process.env.TABLE_PREFIX}profile_fields_data WHERE pf_ooc_nickname = ?`,
                    [oocNickname]
                );

                if (rows.length === 0) {
                    return interaction.editReply({
                        content: `Пользователь с никнеймом "${oocNickname}" не найден на форуме.`,
                        ephemeral: true,
                    });
                }
                userId = rows[0].user_id;
                userTag = oocNickname;
            } else if (userMention) {
                const [rows] = await pool.execute(
                    `SELECT user_id, pf_ooc_nickname FROM ${process.env.TABLE_PREFIX}profile_fields_data WHERE pf_discord = ?`,
                    [userMention.tag]
                );

                if (rows.length === 0) {
                    return interaction.editReply({
                        content: `Пользователь ${userMention.tag} не найден на форуме.`,
                        ephemeral: true,
                    });
                }
                userId = rows[0].user_id;
                userTag = rows[0].pf_ooc_nickname;
            }

            const syncedGroups = Object.entries(syncData[guild.id]).filter(([key]) => key !== 'pinnedMessageId' && key !== 'logChannelId');
            const syncedGroup = syncedGroups.find(([forumGroupId, roleId]) => roleId === discordRole.id);

            if (!syncedGroup) {
                return interaction.editReply({
                    content: `Роль ${discordRole.name} не синхронизирована с группами форума.`,
                    ephemeral: true,
                });
            }

            const forumGroupId = syncedGroup[0];
            const groupName = syncedGroup[1];

            await pool.execute(
                `INSERT INTO ${process.env.TABLE_PREFIX}user_group (user_id, group_id, user_pending) VALUES (?, ?, 0)`,
                [userId, forumGroupId]
            );

            const member = userMention
                ? await guild.members.fetch(userMention.id)
                : await guild.members.fetch(interaction.user.id);

            if (!member.roles.cache.has(discordRole.id)) {
                await member.roles.add(discordRole);
            }

            //const logChannelId = syncData[guild.id]?.logChannelId;
            //const logChannel = logChannelId
               // ? guild.channels.cache.get(logChannelId)
              //  : null;

            //const logMessage = `Выполнена команда /addrole\n``> Роль <@&${discordRole.id}> добавлена пользователю ${userTag}.\n> Группа на форуме (ID: ${forumGroupId}) добавлена.`;
            //if (logChannel) {
            //    logChannel.send(logMessage);
            //}

            return interaction.editReply({
                content: `Роль ${discordRole.name} добавлена пользователю ${userTag}. Группа (ID: ${forumGroupId}) добавлена на форуме.`,
                ephemeral: false,
            });
        } catch (error) {
            console.error('Ошибка в команде /addrole:', error);
            return interaction.editReply({
                content: 'Произошла ошибка при выполнении команды. Попробуйте позже.',
                ephemeral: true,
            });
        }
    },
};
