const { SlashCommandBuilder } = require('discord.js');
const { getDepartments, transferTicket, getTicketByChannel } = require('../handlers/ticketHandlers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('transfer')
    .setDescription('Transfiere el ticket a otro departamento')
    .addStringOption((opt) =>
      opt.setName('departamento').setDescription('Departamento destino').setRequired(true).setAutocomplete(true)
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const departments = await getDepartments(interaction.guild.id);
    const filtered = departments.filter((d) => d.name.toLowerCase().includes(focused.toLowerCase())).slice(0, 25);
    await interaction.respond(filtered.map((d) => ({ name: d.name, value: d.id })));
  },

  async execute(interaction) {
    const ticket = await getTicketByChannel(interaction.channel.id);
    if (!ticket) return interaction.reply({ content: 'Esto no es un ticket.', ephemeral: true });

    const departmentId = interaction.options.getString('departamento');
    await interaction.deferReply({ ephemeral: true });
    await transferTicket(interaction, departmentId);
    await interaction.editReply({ content: 'Ticket transferido.' });
  },
};
