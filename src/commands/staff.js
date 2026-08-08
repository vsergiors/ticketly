const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const supabase = require('../lib/supabase');
const { getStaffRoles } = require('../handlers/ticketHandlers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('staff')
    .setDescription('Gestiona los roles de staff globales')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub.setName('add').setDescription('Añade un rol de staff global').addRoleOption((o) => o.setName('rol').setDescription('Rol').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub.setName('quitar').setDescription('Quita un rol de staff global').addRoleOption((o) => o.setName('rol').setDescription('Rol').setRequired(true))
    )
    .addSubcommand((sub) => sub.setName('listar').setDescription('Lista los roles de staff globales')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const rol = interaction.options.getRole('rol');
      const { error } = await supabase.from('staff_roles').insert({ guild_id: interaction.guild.id, role_id: rol.id });
      if (error) return interaction.reply({ content: 'Ese rol ya es staff (o hubo un error).', ephemeral: true });
      return interaction.reply({ content: `✅ ${rol} añadido como staff global.`, ephemeral: true });
    }

    if (sub === 'quitar') {
      const rol = interaction.options.getRole('rol');
      await supabase.from('staff_roles').delete().eq('guild_id', interaction.guild.id).eq('role_id', rol.id);
      return interaction.reply({ content: `🗑️ ${rol} quitado de staff global.`, ephemeral: true });
    }

    if (sub === 'listar') {
      const roles = await getStaffRoles(interaction.guild.id);
      if (!roles.length) return interaction.reply({ content: 'No hay roles de staff global configurados.', ephemeral: true });
      const embed = new EmbedBuilder()
        .setTitle('Staff global')
        .setColor('#5865F2')
        .setDescription(roles.map((r) => `<@&${r.role_id}>`).join('\n'));
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
