const { SlashCommandBuilder } = require('discord.js');
const { closeTicket } = require('../handlers/ticketHandlers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('close')
    .setDescription('Cierra el ticket actual')
    .addStringOption((opt) => opt.setName('motivo').setDescription('Motivo del cierre').setRequired(false)),

  async execute(interaction) {
    const reason = interaction.options.getString('motivo');
    await closeTicket(interaction, reason);
  },
};
