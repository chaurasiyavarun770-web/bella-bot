require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    EmbedBuilder, 
    SlashCommandBuilder, 
    REST, 
    Routes, 
    PermissionFlagsBits 
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessageReactions
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// 📌 Channel & Role IDs
const PROPERTY_HUB_ID = '1521747828374900826';
const SERVER_RULES_CHANNEL_ID = '1517835187822661722';
const WELCOME_CHANNEL_ID = '1528676193942114414';
const MEMBER_LIST_CHANNEL_ID = '1529044883321651210';
const REGISTRATION_CHANNEL_ID = '1563853881534971954';

const HE_HIS_ROLE_ID = '1528674197163999303';
const SHE_HER_ROLE_ID = '1529032223817334784';
const MEMBER_ROLE_ID = '1528687536879177768';

// 👉 Teri di gayi Management/Moderator Role ID yahan set kar di gayi hai
const MANAGEMENT_ROLE_ID = '1563869853083762708';

// Temporary storage for in-game numbers
const playerGameNumbers = new Map();

// Dynamic Management Access Storage
const managementUsers = new Set();

// Timestamp tracking to identify OLD members vs NEW members joining after bot is active
const botStartTime = Date.now();

// 1. Slash Command Structure (/clear, /setnumber, /give, /remove)
const commands = [
    new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Purge a specified number of recent messages (1-100)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Number of messages to delete (1-100)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100)
        ),
    new SlashCommandBuilder()
        .setName('setnumber')
        .setDescription('Register your In-Game Number (Up to 8 digits)')
        .addStringOption(option =>
            option.setName('number')
                .setDescription('Enter your In-Game Number (1 to 8 digits)')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('give')
        .setDescription('Give management role & hidden channels access to a member [Admin/Owner Only]')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Select the member to give access')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Remove management role & lock hidden channels from a member [Admin/Owner Only]')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Select the member to remove access')
                .setRequired(true)
        )
].map(command => command.toJSON());

// Helper function to update Online Member Stats channel safely
async function updateOnlineStats(guild) {
    try {
        const onlineMembers = guild.members.cache.filter(m => {
            if (m.user.bot) return false;
            const status = m.presence?.status;
            return status && status !== 'offline';
        }).size;

        const onlineChannel = guild.channels.cache.find(c => c.isVoiceBased() && c.name.toLowerCase().includes('online'));

        if (onlineChannel) {
            const newName = `🟢 Online: ${onlineMembers}`;
            if (onlineChannel.name !== newName) {
                await onlineChannel.setName(newName);
            }
        }
    } catch (error) {}
}

// Helper function to update the Member List Channel safely with character limit protection
async function updateMemberListChannel(guild) {
    try {
        const listChannel = await guild.channels.fetch(MEMBER_LIST_CHANNEL_ID).catch(() => null);
        if (!listChannel) return;

        await guild.members.fetch().catch(() => {});
        const membersArray = Array.from(guild.members.cache.values()).filter(m => !m.user.bot);

        let description = '📋 **THE ROADRAGE CLUB — OFFICIAL MEMBER LIST** 📋\n\n' +
                          '> *Here is the secure registry of all active racers and their in-game numbers.*\n\n';

        if (membersArray.length === 0) {
            description += '*No members registered yet.*';
        } else {
            membersArray.forEach((member, index) => {
                const gameNum = playerGameNumbers.get(member.id);
                if (gameNum) {
                    const entry = `**${index + 1}.** ${member} ── \`${gameNum}\`\n`;
                    if (description.length + entry.length < 4000) {
                        description += entry;
                    }
                }
            });
        }

        const listEmbed = new EmbedBuilder()
            .setColor('#3498DB')
            .setTitle('🏎️ SECURE RACER DIRECTORY & IN-GAME NUMBERS 🏎️')
            .setDescription(description)
            .setFooter({ text: `Total Registered Racers` })
            .setTimestamp();

        const messages = await listChannel.messages.fetch({ limit: 5 }).catch(() => null);
        const existingMsg = messages ? messages.find(m => m.author.id === client.user.id) : null;

        if (existingMsg) {
            await existingMsg.edit({ embeds: [listEmbed] }).catch(async () => {
                await listChannel.send({ embeds: [listEmbed] }).catch(() => {});
            });
        } else {
            await listChannel.send({ embeds: [listEmbed] }).catch(() => {});
        }
    } catch (error) {
        console.log('Member list update skipped safely:', error);
    }
}

// 2. Bot Ready Event & Auto-Send Embeds
client.once('clientReady', async () => {
    console.log(`🤖 ${client.user.tag} is online and active!`);
    
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('✅ Slash commands registered successfully!');
    } catch (error) {
        console.error('Error registering slash commands:', error);
    }

    client.guilds.cache.forEach(guild => {
        updateOnlineStats(guild);
        updateMemberListChannel(guild);
    });

    // Auto-send Rules & Pronoun Embed
    try {
        const rulesChannel = await client.channels.fetch(SERVER_RULES_CHANNEL_ID).catch(() => null);
        if (rulesChannel) {
            const messages = await rulesChannel.messages.fetch({ limit: 5 }).catch(() => null);
            const existingMsg = messages ? messages.find(m => m.author.id === client.user.id && m.embeds.length > 0) : null;

            if (!existingMsg) {
                const embed = new EmbedBuilder()
                    .setColor('#FF4500')
                    .setTitle('🏁 THE ROADRAGE CLUB — RULES & VERIFICATION 🏁')
                    .setDescription(
                        '> *“Respect the community. Race with honor.”*\n\n' +
                        '**📜 SERVER RULES:**\n' +
                        '1. **Respect Everyone** — No harassment or personal attacks.\n' +
                        '2. **No Abusive Language** — Hateful or discriminatory language is prohibited.\n' +
                        '3. **No Spam** — No message or link spam.\n' +
                        '4. **No Advertising** — Unauthorized ads are not allowed.\n' +
                        '5. **Follow Discord ToS** — Comply with Discord Guidelines.\n\n' +
                        '━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
                        '✨ **SELECT YOUR PRONOUN TO UNLOCK SERVER:**\n' +
                        'Click the respective emoji below to get your pronoun role, **Member** role, and instant full access to the server:\n\n' +
                        '👦 **`- ✨ He/His ༄·°`** ── React with 💙\n' +
                        '👧 **`She/Her`** ── React with 💖\n\n' +
                        '━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
                        '⚠️ *Reacting will instantly grant you access!*'
                    )
                    .setFooter({ text: 'The RoadRage Club • Verification System', iconURL: client.user.displayAvatarURL() })
                    .setTimestamp();

                const sentMsg = await rulesChannel.send({ embeds: [embed] });
                await sentMsg.react('💙');
                await sentMsg.react('💖');
                console.log('✅ Direct Pronoun Verification message sent successfully!');
            }
        }
    } catch (error) {
        console.error('Error sending message:', error);
    }
});

// Live Stats Interval
setInterval(() => {
    client.guilds.cache.forEach(guild => {
        updateOnlineStats(guild);
    });
}, 30 * 1000);

client.on('guildMemberAdd', async (member) => {
    updateOnlineStats(member.guild);
    updateMemberListChannel(member.guild);

    try {
        const welcomeChannel = await member.guild.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
        if (welcomeChannel) {
            const welcomeEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🏎️ NEW RACER JOINED THE ROADRAGE CLUB! 🏎️')
                .setDescription(
                    `Hey everyone, welcome ${member} to the server! 🎉\n\n` +
                    `> *Head over to <#${SERVER_RULES_CHANNEL_ID}>, read the rules, and select your pronoun role!*\n\n` +
                    `📌 **Important:** Go to <#${REGISTRATION_CHANNEL_ID}> and use the command \`/setnumber [your in-game number]\` to register your **1 to 8 digits** ID before you can send messages in chat!`
                )
                .setImage('https://media.giphy.com/media/l0HlHFRbmaZtBRhXG/giphy.gif')
                .setFooter({ text: `Member #${member.guild.memberCount}`, iconURL: member.user.displayAvatarURL() })
                .setTimestamp();

            await welcomeChannel.send({
                content: `||@everyone|| Welcome ${member}! 🔥`,
                embeds: [welcomeEmbed]
            });
        }
    } catch (error) {
        console.error('Error sending welcome message:', error);
    }
});

client.on('guildMemberRemove', async (member) => {
    updateOnlineStats(member.guild);
    updateMemberListChannel(member.guild);
    managementUsers.delete(member.id);

    try {
        const channels = member.guild.channels.cache.filter(c => c.isTextBased());
        for (const [channelId, channel] of channels) {
            try {
                const messages = await channel.messages.fetch({ limit: 100 });
                const userMessages = messages.filter(m => m.author.id === member.id);
                if (userMessages.size > 0) {
                    await channel.bulkDelete(userMessages, true);
                }
            } catch (err) {}
        }
    } catch (error) {}
});

// 3. Slash Commands Handler (/clear, /setnumber, /give, /remove)
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const isOwnerOrAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator) || interaction.guild.ownerId === interaction.user.id;
    const hasBotManagementAccess = isOwnerOrAdmin || managementUsers.has(interaction.user.id) || interaction.member.roles.cache.has(MANAGEMENT_ROLE_ID);

    // --- /clear Command ---
    if (interaction.commandName === 'clear') {
        if (!hasBotManagementAccess) {
            return await interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
        }

        const amount = interaction.options.getInteger('amount');

        try {
            const deleted = await interaction.channel.bulkDelete(amount, true);
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setDescription(`🧹 Successfully deleted **${deleted.size}** message(s).`);

            await interaction.reply({ embeds: [embed], ephemeral: false });
            setTimeout(async () => { try { await interaction.deleteReply(); } catch (e) {} }, 2000);
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to delete messages.', ephemeral: true });
        }
    }

    // --- /setnumber Command ---
    if (interaction.commandName === 'setnumber') {
        if (interaction.channel.id !== REGISTRATION_CHANNEL_ID) {
            return await interaction.reply({
                content: `❌ You can only use the \`/setnumber\` command inside the official registration channel: <#${REGISTRATION_CHANNEL_ID}>!`,
                ephemeral: true
            });
        }

        const gameNum = interaction.options.getString('number');

        if (!/^\d{1,8}$/.test(gameNum)) {
            return await interaction.reply({ 
                content: '❌ Invalid format! Your In-Game Number must be numeric and between **1 to 8 digits** only.', 
                ephemeral: true 
            });
        }

        const userId = interaction.user.id;
        const existingNum = playerGameNumbers.get(userId);

        if (existingNum === gameNum) {
            return await interaction.reply({
                content: `⚠️ Your In-Game Number (**${gameNum}**) is already submitted and registered!`,
                ephemeral: true
            });
        }

        playerGameNumbers.set(userId, gameNum);
        await updateMemberListChannel(interaction.guild);

        const replyMessage = existingNum 
            ? `✅ Success! Your In-Game Number has been updated to **${gameNum}** (previous: ${existingNum}) and refreshed in the member list!`
            : `✅ Success! Your In-Game Number (**${gameNum}**) has been registered and updated in the member list!`;

        await interaction.reply({ 
            content: replyMessage, 
            ephemeral: true 
        });
    }

    // --- /give Command ---
    if (interaction.commandName === 'give') {
        if (!isOwnerOrAdmin) {
            return await interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
        }

        const targetUser = interaction.options.getUser('user');
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        if (!targetMember) {
            return await interaction.reply({ content: '❌ Member not found in this server.', ephemeral: true });
        }

        managementUsers.add(targetUser.id);

        try {
            await targetMember.roles.add(MANAGEMENT_ROLE_ID);
        } catch (err) {}

        await interaction.reply({ 
            content: `✅ Successfully granted management access and unlocked hidden channels for <@${targetUser.id}>!`, 
            ephemeral: true 
        });
    }

    // --- /remove Command ---
    if (interaction.commandName === 'remove') {
        if (!isOwnerOrAdmin) {
            return await interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
        }

        const targetUser = interaction.options.getUser('user');
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        managementUsers.delete(targetUser.id);

        if (targetMember) {
            try {
                await targetMember.roles.remove(MANAGEMENT_ROLE_ID);
            } catch (err) {}
        }

        await interaction.reply({ 
            content: `✅ Successfully removed management access and locked hidden channels from <@${targetUser.id}>!`, 
            ephemeral: true 
        });
    }
});

// 4. Message Guard (Property Hub & New Member Chat Lock)
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const isAdminOrOwner = message.member && (
        message.member.permissions.has(PermissionFlagsBits.Administrator) || 
        message.guild.ownerId === message.author.id
    );

    if (isAdminOrOwner) {
        if (message.channel.id === PROPERTY_HUB_ID) {
            const content = message.content;
            const hasImage = message.attachments.size > 0;
            const lowerContent = content.toLowerCase();

            const hasPropertyType = lowerContent.includes('property type:');
            const hasLocation = lowerContent.includes('property location:');
            const hasAskingPrice = lowerContent.includes('asking price:');
            const hasOwnerName = lowerContent.includes('owner name:');
            const hasContact = lowerContent.includes('contact number:');
            const hasProof = lowerContent.includes('proof / evidence:');
            const hasTag = lowerContent.includes('tag: @everyone') || lowerContent.includes('@everyone');

            if (hasImage && hasPropertyType && hasLocation && hasAskingPrice && hasOwnerName && hasContact && hasProof && hasTag) {
                return;
            }

            try {
                await message.delete();
                const warningEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Invalid Property Post Format!')
                    .setDescription(`Hello ${message.author}, your post was removed due to incorrect format.`);

                const warnMsg = await message.channel.send({ embeds: [warningEmbed] });
                setTimeout(() => { warnMsg.delete().catch(() => {}); }, 10000);
            } catch (error) {}
        }
        return;
    }

    const memberJoinedTimestamp = message.member?.joinedTimestamp || 0;
    const isNewMember = memberJoinedTimestamp > botStartTime;

    if (isNewMember && !playerGameNumbers.has(message.author.id)) {
        try {
            await message.delete();
            const warningEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('⚠️ Action Required: In-Game Number Missing!')
                .setDescription(
                    `Hello ${message.author}, as a new member, you must set your in-game number before chatting!\n\n` +
                    `> *Kindly set your number using the command \`/setnumber\` in <#${REGISTRATION_CHANNEL_ID}>.*`
                );

            const warnMsg = await message.channel.send({ embeds: [warningEmbed] });
            setTimeout(() => { warnMsg.delete().catch(() => {}); }, 3000);
        } catch (error) {}
        return;
    }

    if (message.channel.id === PROPERTY_HUB_ID) {
        const content = message.content;
        const hasImage = message.attachments.size > 0;
        const lowerContent = content.toLowerCase();

        const hasPropertyType = lowerContent.includes('property type:');
        const hasLocation = lowerContent.includes('property location:');
        const hasAskingPrice = lowerContent.includes('asking price:');
        const hasOwnerName = lowerContent.includes('owner name:');
        const hasContact = lowerContent.includes('contact number:');
        const hasProof = lowerContent.includes('proof / evidence:');
        const hasTag = lowerContent.includes('tag: @everyone') || lowerContent.includes('@everyone');

        if (hasImage && hasPropertyType && hasLocation && hasAskingPrice && hasOwnerName && hasContact && hasProof && hasTag) {
            return;
        }

        try {
            await message.delete();
            let timeoutGiven = false;
            try {
                await message.member.timeout(15 * 60 * 1000, 'Invalid property post format');
                timeoutGiven = true;
            } catch (err) {}

            const warningEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Invalid Property Post Format!')
                .setDescription(`Hello ${message.author}, your post was removed due to incorrect format.\n${timeoutGiven ? '⏳ **Penalty:** 15 minutes timeout.' : ''}`);

            const warnMsg = await message.channel.send({ embeds: [warningEmbed] });
            setTimeout(() => { warnMsg.delete().catch(() => {}); }, 10000);
        } catch (error) {}
    }
});

// 5. Reaction Role Listener (Add Roles)
client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;

    try {
        if (reaction.partial) await reaction.fetch();
        if (reaction.message.partial) await reaction.message.fetch();

        const guild = reaction.message.guild;
        if (!guild) return;

        const member = await guild.members.fetch(user.id).catch(() => null);
        if (!member) return;

        if (reaction.message.channel.id === SERVER_RULES_CHANNEL_ID) {
            const emojiName = reaction.emoji.name;

            if (emojiName === '💙') {
                await member.roles.add(HE_HIS_ROLE_ID);
                await member.roles.add(MEMBER_ROLE_ID);
                console.log(`✅ He/His & Member roles added to ${user.tag}`);
            } else if (emojiName === '💖') {
                await member.roles.add(SHE_HER_ROLE_ID);
                await member.roles.add(MEMBER_ROLE_ID);
                console.log(`✅ She/Her & Member roles added to ${user.tag}`);
            }
        }
    } catch (error) {
        console.log('Error in messageReactionAdd:', error);
    }
});

// 6. Reaction Role Remove Listener (Remove Roles)
client.on('messageReactionRemove', async (reaction, user) => {
    if (user.bot) return;

    try {
        if (reaction.partial) await reaction.fetch();
        if (reaction.message.partial) await reaction.message.fetch();

        const guild = reaction.message.guild;
        if (!guild) return;

        const member = await guild.members.fetch(user.id).catch(() => null);
        if (!member) return;

        if (reaction.message.channel.id === SERVER_RULES_CHANNEL_ID) {
            const emojiName = reaction.emoji.name;

            if (emojiName === '💙') {
                await member.roles.remove(HE_HIS_ROLE_ID);
                if (!member.roles.cache.has(SHE_HER_ROLE_ID)) {
                    await member.roles.remove(MEMBER_ROLE_ID);
                }
                console.log(`❌ He/His role removed from ${user.tag}`);
            } else if (emojiName === '💖') {
                await member.roles.remove(SHE_HER_ROLE_ID);
                if (!member.roles.cache.has(HE_HIS_ROLE_ID)) {
                    await member.roles.remove(MEMBER_ROLE_ID);
                }
                console.log(`❌ She/Her role removed from ${user.tag}`);
            }
        }
    } catch (error) {
        console.log('Error in messageReactionRemove:', error);
    }
});

client.login(process.env.TOKEN);