const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const dotenv = require('dotenv');
const fs = require('fs');
const mysql = require('mysql2/promise');

dotenv.config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

const commandFiles = fs.readdirSync('./modules').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(`./modules/${file}`);
    client.commands.set(command.data.name, command);
}

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
};

async function checkDatabaseConnection() {
    try {
        const connection = await mysql.createConnection(dbConfig);
        console.log('Подключение к MySQL успешно установлено.');
        await connection.end();
    } catch (error) {
        console.error('Ошибка подключения к MySQL:', error.message);
        process.exit(1);
    }
}

client.once('ready', async () => {
    console.log(`OK: ${client.user.tag}`);
    await checkDatabaseConnection();
    const commands = client.commands.map(cmd => cmd.data.toJSON());

    const rest = new REST({version: '10'}).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log('Регистрация глобальных команд...');

        await rest.put(Routes.applicationCommands(client.user.id), {
            body: commands,
        });

        console.log('Глобальные команды успешно зарегистрированы.');
    } catch (error) {
        console.error('Ошибка при регистрации глобальных команд:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: 'Ошибка при выполнении команды.', ephemeral: true });
    }
});

client.login(process.env.DISCORD_TOKEN);
