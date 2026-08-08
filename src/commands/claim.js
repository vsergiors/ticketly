const { SlashCommandBuilder } = require('discord.js');
const { claimTicket } = require('../handlers/ticketHandlers');

module.exports = {
  data: new SlashCommandBuilder().setName('claim').setDescription('Reclama el ticket actual'),
  async execute(interaction) {
    await claimTicket(interaction);
  },
};
