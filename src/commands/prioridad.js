const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const supabase = require('../lib/supabase');
const { getPriorities } = require('../handlers/ticketHandlers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('prioridad')
    .setDescription('Gestiona las prioridades de tickets')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Crea una prioridad')
        .addStringOption((o) => o.setName('nombre').setDescription('Nombre (ej: Urgente)').setRequired(true))
        .addStringOption((o) => o.setName('emoji').setDescription('Emoji (ej: 🔴)').setRequired(false))
        .addStringOption((o) => o.setName('color').setDescription('Color hex, ej: #e74c3c').setRequired(false))
        .addBooleanOption((o) => o.setName('por_defecto').setDescription('¿Es la prioridad por defecto?').setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName('quitar')
        .setDescription('Elimina una prioridad')
        .addStringOption((o) => o.setName('nombre').setDescription('Prioridad').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((sub) => sub.setName('listar').setDescription('Lista las prioridades configuradas')),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const priorities = await getPriorities(interaction.guild.id);
    const filtered = priorities.filter((p) => p.name.toLowerCase().includes(focused.toLowerCase())).slice(0, 25);
    await interaction.respond(filtered.map((p) => ({ name: p.name, value: p.id })));
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const nombre = interaction.options.getString('nombre');
      const emoji = interaction.options.getString('emoji') || '⚪';
      const color = interaction.options.getString('color') || '#95a5a6';
      const porDefecto = interaction.options.getBoolean('por_defecto') || false;

      if (!/^#([0-9a-fA-F]{6})$/.test(color)) {
        return interaction.reply({ content: 'El color debe ser hexadecimal, ej: #e74c3c', ephemeral: true });
      }

      if (porDefecto) {
        await supabase.from('priorities').update({ is_default: false }).eq('guild_id', interaction.guild.id);
      }

      const { error } = await supabase.from('priorities').insert({
        guild_id: interaction.guild.id,
        name: nombre,
        emoji,
        color,
        is_default: porDefecto,
      });

      if (error) return interaction.reply({ content: 'Error al crear la prioridad.', ephemeral: true });

      return interaction.reply({ content: `✅ Prioridad **${emoji} ${nombre}** creada.`, ephemeral: true });
    }

    if (sub === 'quitar') {
      const id = interaction.options.getString('nombre');
      await supabase.from('priorities').delete().eq('id', id).eq('guild_id', interaction.guild.id);
      return interaction.reply({ content: '🗑️ Prioridad eliminada.', ephemeral: true });
    }

    if (sub === 'listar') {
      const priorities = await getPriorities(interaction.guild.id);
      if (!priorities.length) return interaction.reply({ content: 'No hay prioridades configuradas.', ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle('Prioridades')
        .setColor('#5865F2')
        .setDescription(priorities.map((p) => `${p.emoji || ''} **${p.name}** · ${p.color}${p.is_default ? ' · (por defecto)' : ''}`).join('\n'));
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
