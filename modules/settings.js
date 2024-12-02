const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const fs = require('fs');
const mysql = require('mysql2/promise');
const config = require('../config.json');
const syncFilePath = './sync.json';

function loadSyncData() {
    if (fs.existsSync(syncFilePath)) {
        return JSON.parse(fs.readFileSync(syncFilePath, 'utf8'));
    } else {
        console.log('Файл синхронизации не найден. Используется пустой объект.');
        return {};
    }
}

const syncData = loadSyncData();

function saveSyncData(syncData) {
    fs.writeFileSync(syncFilePath, JSON.stringify(syncData, null, 2));
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
        .setName('settings')
        .setDescription('Настройки ролей и групп')
        .addSubcommand(subcommand =>
            subcommand
                .setName('message')
                .setDescription('Создать закреплённое сообщение в канале верификации'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('roles')
                .setDescription('Показать все группы на форуме'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('sync')
                .setDescription('Синхронизация группы и роли')
                .addIntegerOption(option =>
                    option.setName('group_id')
                        .setDescription('ID группы на форуме')
                        .setRequired(true))
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('Роль в Discord')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('logchannel')
                .setDescription('Установить канал для логов')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Канал для логов')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true))),
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'roles') {
            try {
                const [rows] = await pool.execute(
                    `SELECT group_id, group_name, group_colour FROM ${process.env.TABLE_PREFIX}groups`
                );

                if (rows.length === 0) {
                    return interaction.reply({ content: 'На форуме нет групп.', ephemeral: true, flags: [ 4096 ] });
                }

                const chunks = [];
                const chunkSize = 24;

                for (let i = 0; i < rows.length; i += chunkSize) {
                    chunks.push(rows.slice(i, i + chunkSize));
                }

                const embeds = chunks.map((chunk, index) => {
                    const embed = new EmbedBuilder()
                        .setTitle(`Группы и роли (Часть ${index + 1})`)
                        .setColor('#303136');

                    chunk.forEach(row => {
                        const syncedRole = syncData[interaction.guild.id]?.[row.group_id];
                        embed.addFields({
                            name: `${row.group_name}`,
                            value: `ID группы: ${row.group_id}, цвет: #${row.group_colour}, синхронизировано с ролью: ${
                                syncedRole ? `<@&${syncedRole}>` : 'Нет'
                            }`,
                            inline: false,
                        });
                    });

                    return embed;
                });

                for (const embed of embeds) {
                    await interaction.channel.send({ embeds: [embed], flags: [ 4096 ] });
                }

                return interaction.reply({ content: 'Список групп отправлен.', ephemeral: false, flags: [ 4096 ] });
            } catch (error) {
                console.error('Ошибка в SQL-запросе:', error);
                return interaction.reply({ content: 'Ошибка при обращении к базе данных.', ephemeral: true, flags: [ 4096 ] });
            }
        }

        if (subcommand === 'logchannel') {
            const logChannel = interaction.options.getChannel('channel');
            const guild = interaction.guild;
            syncData[guild.id].logChannelId = logChannel.id;
            saveSyncData(syncData);

            return interaction.reply({
                content: `Канал для логов успешно установлен: <#${logChannel.id}>`,
                ephemeral: true,
                flags: [ 4096 ],
            });
        }

        if (subcommand === 'message') {
            const guild = interaction.guild;
            const channel = guild.channels.cache.get(config.verifyChannelId);

            if (!channel) {
                return interaction.reply({ content: 'Канал для верификации не найден.', ephemeral: true, flags: [ 4096 ] });
            }

            const embed = new EmbedBuilder()
                .setTitle('Добро пожаловать!')
                .setDescription('Используйте команду `/sync [OOC никнейм] [IC никнейм]` для синхронизации ваших ролей на форуме с ролями в Discord. Обратите внимание, что в Вашем профиле на форуме должны быть заполнены следующие поля: `OOC никнейм; Discord`. Поле Discord должно совпадать с текущим. Если у Вас остались вопросы - обратитесь в тикеты.')
                .setColor('#303136')
                .setThumbnail('https://i.imgur.com/4LhIQRb.png')
                .setImage('attachment://syncs.png')
                .setFooter({ text: `Los Santos Police Department. Специально для RPW.` })


            const message = await channel.send({ embeds: [embed], flags: [ 4096 ] });
            await message.pin();

            const syncData = loadSyncData();
            if (!syncData[guild.id]) syncData[guild.id] = {};
            syncData[guild.id].pinnedMessageId = message.id;
            saveSyncData(syncData);

            return interaction.reply({ content: 'Сообщение успешно создано и закреплено.', ephemeral: true, flags: [ 4096 ] });
        }

        if (subcommand === 'sync') {
            const groupId = interaction.options.getInteger('group_id');
            const role = interaction.options.getRole('role');

            if (!syncData[interaction.guild.id]) syncData[interaction.guild.id] = {};
            syncData[interaction.guild.id][groupId] = role.id;

            fs.writeFileSync(syncFilePath, JSON.stringify(syncData, null, 2));
            return interaction.reply({
                content: `Группа с ID ${groupId} успешно синхронизирована с ролью ${role}`,
                ephemeral: true,
                flags: [ 4096 ],
            });
        }
    },
};
