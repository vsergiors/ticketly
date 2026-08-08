const { SlashCommandBuilder, ChannelType, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const supabase = require('../lib/supabase');
const { getDepartments } = require('../handlers/ticketHandlers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('departamento')
    .setDescription('Gestiona los departamentos de tickets')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Crea un departamento')
        .addStringOption((o) => o.setName('nombre').setDescription('Nombre del departamento').setRequired(true))
        .addStringOption((o) => o.setName('emoji').setDescription('Emoji (ej: 📁)').setRequired(false))
        .addChannelOption((o) =>
          o.setName('categoria').setDescription('Categoría donde se crean los tickets').addChannelTypes(ChannelType.GuildCategory).setRequired(false)
        )
        .addRoleOption((o) => o.setName('rol_staff').setDescription('Rol que atiende este departamento').setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName('quitar')
        .setDescription('Elimina un departamento')
        .addStringOption((o) => o.setName('nombre').setDescription('Departamento').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((sub) => sub.setName('listar').setDescription('Lista los departamentos configurados')),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const departments = await getDepartments(interaction.guild.id);
    const filtered = departments.filter((d) => d.name.toLowerCase().includes(focused.toLowerCase())).slice(0, 25);
    await interaction.respond(filtered.map((d) => ({ name: d.name, value: d.id })));
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const nombre = interaction.options.getString('nombre');
      const emoji = interaction.options.getString('emoji') || '📁';
      const categoria = interaction.options.getChannel('categoria');
      const rol = interaction.options.getRole('rol_staff');

      const { error } = await supabase.from('departments').insert({
        guild_id: interaction.guild.id,
        name: nombre,
        emoji,
        category_id: categoria?.id || null,
        staff_role_id: rol?.id || null,
      });

      if (error) return interaction.reply({ content: 'Error al crear el departamento.', ephemeral: true });

      return interaction.reply({
        content: `✅ Departamento **${emoji} ${nombre}** creado${categoria ? ` en la categoría ${categoria.name}` : ''}${rol ? ` · staff: ${rol}` : ''}.`,
        ephemeral: true,
      });
    }

    if (sub === 'quitar') {
      const id = interaction.options.getString('nombre');
      await supabase.from('departments').delete().eq('id', id).eq('guild_id', interaction.guild.id);
      return interaction.reply({ content: '🗑️ Departamento eliminado.', ephemeral: true });
    }

    if (sub === 'listar') {
      const departments = await getDepartments(interaction.guild.id);
      if (!departments.length) return interaction.reply({ content: 'No hay departamentos configurados.', ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle('Departamentos')
        .setColor('#5865F2')
        .setDescription(
          departments
            .map(
              (d) =>
                `${d.emoji || '📁'} **${d.name}**${d.category_id ? ` · categoría: <#${d.category_id}>` : ''}${
                  d.staff_role_id ? ` · staff: <@&${d.staff_role_id}>` : ''
                }`
            )
            .join('\n')
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
