const { SlashCommandBuilder } = require('discord.js');
const { unclaimTicket } = require('../handlers/ticketHandlers');

module.exports = {
  data: new SlashCommandBuilder().setName('unclaim').setDescription('Quita la reclamación del ticket actual'),
  async execute(interaction) {
    await unclaimTicket(interaction);
  },
};
