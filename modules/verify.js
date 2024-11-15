const { SlashCommandBuilder } = require('discord.js');
const mysql = require('mysql2/promise');
const config = require('../config.json');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

module.exports = {
    data: new SlashCommandBuilder()
        .setName('verify')
        .setDescription('Проверка OOC никнейма')
        .addStringOption(option =>
            option.setName('nickname')
                .setDescription('Ваш OOC никнейм')
                .setRequired(true)),
    async execute(interaction) {
        const nickname = interaction.options.getString('nickname');
        const discordTag = interaction.user.tag;

        if (interaction.channelId !== config.verifyChannelId) {
            return interaction.reply({ content: 'Эту команду можно использовать только в определённом канале.', ephemeral: true });
        }

        try {
            const [rows] = await pool.execute(
                `SELECT * FROM ${process.env.TABLE_PREFIX}profile_fields_data WHERE pf_ooc_nickname = ? AND pf_discord = ?`,
                [nickname, discordTag]
            );

            if (rows.length > 0) {
                return interaction.reply({ content: 'Успешно: пользователь найден и совпадает Discord-тег.', ephemeral: true });
            } else {
                return interaction.reply({ content: 'Неуспешно: никнейм не найден или Discord-тег не совпадает.', ephemeral: true });
            }
        } catch (error) {
            console.error('Ошибка в SQL-запросе:', error);
            return interaction.reply({ content: 'Ошибка при обращении к базе данных.', ephemeral: true });
        }
    }
};
