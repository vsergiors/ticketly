const {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');
const supabase = require('../lib/supabase');
const { getGuildConfig } = require('../handlers/ticketHandlers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ajustes')
    .setDescription('Configuración general del sistema de tickets')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) => sub.setName('ver').setDescription('Muestra la configuración actual'))
    .addSubcommand((sub) => sub.setName('texto').setDescription('Edita nombre de ticket, prefijo de reclamo y mensaje de bienvenida'))
    .addSubcommand((sub) =>
      sub
        .setName('canales')
        .setDescription('Configura categoría por defecto y canal de transcripts')
        .addChannelOption((o) =>
          o.setName('categoria_defecto').setDescription('Categoría si el departamento no tiene una propia').addChannelTypes(ChannelType.GuildCategory).setRequired(false)
        )
        .addChannelOption((o) =>
          o.setName('canal_transcripts').setDescription('Canal donde se suben los transcripts al cerrar').addChannelTypes(ChannelType.GuildText).setRequired(false)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const config = await getGuildConfig(interaction.guild.id);

    if (sub === 'ver') {
      const embed = new EmbedBuilder()
        .setTitle('Configuración actual')
        .setColor('#5865F2')
        .addFields(
          { name: 'Formato nombre ticket', value: config?.ticket_name_format || 'ticket-{n}', inline: true },
          { name: 'Nombre al reclamar', value: config?.claimed_channel_name || '🛠️・ticket-{n}', inline: true },
          { name: 'Máx. tickets/usuario', value: String(config?.max_open_per_user ?? 1), inline: true },
          { name: 'Categoría por defecto', value: config?.category_open_fallback ? `<#${config.category_open_fallback}>` : '—', inline: true },
          { name: 'Canal transcripts', value: config?.transcripts_channel_id ? `<#${config.transcripts_channel_id}>` : '—', inline: true },
          { name: 'Mensaje bienvenida', value: config?.welcome_message || '—' }
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'texto') {
      const modal = new ModalBuilder().setCustomId('ajustes_texto_modal').setTitle('Ajustes de texto');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('ticket_name_format')
            .setLabel('Formato del nombre del ticket (usa {n})')
            .setStyle(TextInputStyle.Short)
            .setValue(config?.ticket_name_format || 'ticket-{n}')
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('claimed_prefix')
            .setLabel('Nombre del canal al reclamar')
            .setStyle(TextInputStyle.Short)
            .setValue(config?.claimed_prefix || '🛠️・ticket-{n}')
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('max_open_per_user')
            .setLabel('Máx. tickets abiertos por usuario')
            .setStyle(TextInputStyle.Short)
            .setValue(String(config?.max_open_per_user ?? 1))
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('welcome_message')
            .setLabel('Mensaje de bienvenida en el ticket')
            .setStyle(TextInputStyle.Paragraph)
            .setValue(config?.welcome_message || '')
            .setRequired(false)
        )
      );

      return interaction.showModal(modal);
    }

    if (sub === 'canales') {
      const categoria = interaction.options.getChannel('categoria_defecto');
      const transcripts = interaction.options.getChannel('canal_transcripts');

      const update = {};
      if (categoria) update.category_open_fallback = categoria.id;
      if (transcripts) update.transcripts_channel_id = transcripts.id;

      if (!Object.keys(update).length) {
        return interaction.reply({ content: 'No indicaste ningún canal para actualizar.', ephemeral: true });
      }

      await supabase.from('guilds').update(update).eq('id', interaction.guild.id);
      return interaction.reply({ content: '✅ Canales actualizados.', ephemeral: true });
    }
  },
};
