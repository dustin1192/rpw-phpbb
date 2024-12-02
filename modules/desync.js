const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const fs = require("fs");
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

module.exports = {
    data: new SlashCommandBuilder()
        .setName('desync')
        .setDescription('Снимает привязку форумного аккаунта и удаляет все роли'),
    async execute(interaction) {
        const discordTag = interaction.user.tag;
        const guildId = interaction.guild.id;

        await interaction.deferReply({ ephemeral: true, flags: [ 4096 ] });

        try {
            const syncData = loadSyncData();

            if (!syncData[guildId]?.users?.[discordTag]) {
                return interaction.editReply({
                    content: 'Вы не привязаны к форуму. Сначала выполните команду `/sync`.',
                });
            }

            const userId = syncData[guildId].users[discordTag];

            delete syncData[guildId].users[discordTag];
            saveSyncData(syncData);

            const syncedRoles = Object.values(syncData[guildId] || {});
            const member = await interaction.guild.members.fetch(interaction.user.id);

            for (const roleId of syncedRoles) {
                const role = interaction.guild.roles.cache.get(roleId);
                if (role && member.roles.cache.has(roleId)) {
                    await member.roles.remove(role);
                }
            }

            return interaction.editReply({
                content: `Ваш аккаунт с ID ${userId} отвязан от Discord, и все роли были удалены.`,
            });
        } catch (error) {
            console.error('Ошибка в команде /desync:', error);
            return interaction.editReply({
                content: 'Произошла ошибка при выполнении команды. Попробуйте позже.',
            });
        }
    },
};
