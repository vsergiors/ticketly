const {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');
const supabase = require('../lib/supabase');
const {
  getPanels,
  getDepartments,
  getPanelDepartments,
  buildTicketPanelEmbed,
} = require('../handlers/ticketHandlers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Gestiona los paneles de apertura de ticket')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('crear')
        .setDescription('Crea un panel (luego elige los departamentos)')
        .addStringOption((o) => o.setName('nombre').setDescription('Nombre interno del panel').setRequired(true))
        .addChannelOption((o) =>
          o.setName('canal').setDescription('Canal donde se enviará').addChannelTypes(ChannelType.GuildText).setRequired(true)
        )
        .addStringOption((o) => o.setName('titulo').setDescription('Título del embed').setRequired(false))
        .addStringOption((o) => o.setName('descripcion').setDescription('Descripción del embed').setRequired(false))
        .addStringOption((o) => o.setName('color').setDescription('Color hex, ej: #2b2d31').setRequired(false))
        .addStringOption((o) =>
          o
            .setName('modo')
            .setDescription('Cómo se eligen los departamentos')
            .addChoices({ name: 'Botones', value: 'botones' }, { name: 'Menú desplegable', value: 'menu' })
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('editar')
        .setDescription('Edita un panel existente y/o sus departamentos')
        .addStringOption((o) => o.setName('nombre').setDescription('Panel a editar').setRequired(true).setAutocomplete(true))
        .addChannelOption((o) =>
          o.setName('canal').setDescription('Nuevo canal donde se enviará').addChannelTypes(ChannelType.GuildText).setRequired(false)
        )
        .addStringOption((o) => o.setName('titulo').setDescription('Nuevo título del embed').setRequired(false))
        .addStringOption((o) => o.setName('descripcion').setDescription('Nueva descripción del embed').setRequired(false))
        .addStringOption((o) => o.setName('color').setDescription('Nuevo color hex, ej: #2b2d31').setRequired(false))
        .addStringOption((o) =>
          o
            .setName('modo')
            .setDescription('Cómo se eligen los departamentos')
            .addChoices({ name: 'Botones', value: 'botones' }, { name: 'Menú desplegable', value: 'menu' })
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('enviar')
        .setDescription('Envía o actualiza el panel en su canal')
        .addStringOption((o) => o.setName('nombre').setDescription('Panel').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('eliminar')
        .setDescription('Elimina un panel')
        .addStringOption((o) => o.setName('nombre').setDescription('Panel').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((sub) => sub.setName('listar').setDescription('Lista los paneles configurados')),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const panels = await getPanels(interaction.guild.id);
    const filtered = panels.filter((p) => p.name.toLowerCase().includes(focused.toLowerCase())).slice(0, 25);
    await interaction.respond(filtered.map((p) => ({ name: p.name, value: p.id })));
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'crear') {
      const departments = await getDepartments(interaction.guild.id);
      if (!departments.length) {
        return interaction.reply({ content: 'Primero crea al menos un departamento con `/departamento add`.', ephemeral: true });
      }

      const nombre = interaction.options.getString('nombre');
      const canal = interaction.options.getChannel('canal');
      const titulo = interaction.options.getString('titulo') || 'Soporte';
      const descripcion = (interaction.options.getString('descripcion') || 'Pulsa el botón de tu departamento para abrir un ticket.')
        .replace(/\/n/g, '\n');
      const color = interaction.options.getString('color') || '#2b2d31';
      const modo = interaction.options.getString('modo') || 'botones';

      if (!/^#([0-9a-fA-F]{6})$/.test(color)) {
        return interaction.reply({ content: 'El color debe ser hexadecimal, ej: #2b2d31', ephemeral: true });
      }

      const { data: panel, error } = await supabase
        .from('panels')
        .insert({
          guild_id: interaction.guild.id,
          name: nombre,
          channel_id: canal.id,
          title: titulo,
          description: descripcion,
          color,
          select_mode: modo === 'menu',
        })
        .select()
        .single();

      if (error || !panel) return interaction.reply({ content: 'Error al crear el panel.', ephemeral: true });

      const menu = new StringSelectMenuBuilder()
        .setCustomId(`panel_depts_select:${panel.id}`)
        .setPlaceholder('Elige los departamentos de este panel')
        .setMinValues(1)
        .setMaxValues(Math.min(departments.length, 25))
        .addOptions(departments.slice(0, 25).map((d) => ({ label: d.name, value: d.id, emoji: d.emoji || undefined })));

      return interaction.reply({
        content: `Panel **${nombre}** creado. Ahora elige qué departamentos aparecen en él:`,
        components: [new ActionRowBuilder().addComponents(menu)],
        ephemeral: true,
      });
    }

    if (sub === 'editar') {
      const panelId = interaction.options.getString('nombre');
      const panels = await getPanels(interaction.guild.id);
      const panel = panels.find((p) => p.id === panelId);
      if (!panel) return interaction.reply({ content: 'Panel no encontrado.', ephemeral: true });

      const canal = interaction.options.getChannel('canal');
      const titulo = interaction.options.getString('titulo');
      const descripcionRaw = interaction.options.getString('descripcion');
      const descripcion = descripcionRaw ? descripcionRaw.replace(/\/n/g, '\n') : null;
      const color = interaction.options.getString('color');
      const modo = interaction.options.getString('modo');

      if (color && !/^#([0-9a-fA-F]{6})$/.test(color)) {
        return interaction.reply({ content: 'El color debe ser hexadecimal, ej: #2b2d31', ephemeral: true });
      }

      const update = {};
      if (canal) update.channel_id = canal.id;
      if (titulo) update.title = titulo;
      if (descripcion) update.description = descripcion;
      if (color) update.color = color;
      if (modo) update.select_mode = modo === 'menu';

      if (Object.keys(update).length) {
        await supabase.from('panels').update(update).eq('id', panel.id);
      }

      const departments = await getDepartments(interaction.guild.id);
      if (!departments.length) {
        return interaction.reply({
          content: `✅ Panel actualizado. No hay departamentos creados todavía — usa \`/departamento add\` y luego vuelve a editar el panel para asignarlos.`,
          ephemeral: true,
        });
      }

      const currentPanelDepts = await getPanelDepartments(panel.id);
      const currentIds = new Set(currentPanelDepts.map((pd) => pd.department_id));

      const menu = new StringSelectMenuBuilder()
        .setCustomId(`panel_depts_select:${panel.id}`)
        .setPlaceholder('Añade o quita departamentos de este panel')
        .setMinValues(0)
        .setMaxValues(Math.min(departments.length, 25))
        .addOptions(
          departments.slice(0, 25).map((d) => ({
            label: d.name,
            value: d.id,
            emoji: d.emoji || undefined,
            default: currentIds.has(d.id),
          }))
        );

      return interaction.reply({
        content: `✅ Panel actualizado. Los departamentos marcados son los que tiene ahora — cambia la selección y confirma para actualizarlos (recuerda usar \`/panel enviar\` después):`,
        components: [new ActionRowBuilder().addComponents(menu)],
        ephemeral: true,
      });
    }

    if (sub === 'enviar') {
      const panelId = interaction.options.getString('nombre');
      const panels = await getPanels(interaction.guild.id);
      const panel = panels.find((p) => p.id === panelId);
      if (!panel) return interaction.reply({ content: 'Panel no encontrado.', ephemeral: true });

      const panelDepts = await getPanelDepartments(panel.id);
      if (!panelDepts.length) {
        return interaction.reply({ content: 'Este panel no tiene departamentos. Vuelve a crearlo o pide que se le asignen.', ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      const channel = interaction.guild.channels.cache.get(panel.channel_id);
      if (!channel) return interaction.editReply('El canal configurado ya no existe.');

      const payload = await buildTicketPanelEmbed(panel, panelDepts);

      try {
        if (panel.message_id) {
          const msg = await channel.messages.fetch(panel.message_id).catch(() => null);
          if (msg) {
            await msg.edit(payload);
            return interaction.editReply('✅ Panel actualizado.');
          }
        }
        const sent = await channel.send(payload);
        await supabase.from('panels').update({ message_id: sent.id }).eq('id', panel.id);
        return interaction.editReply('✅ Panel enviado.');
      } catch (err) {
        console.error(err);
        return interaction.editReply('Error al enviar el panel (revisa permisos del bot en ese canal).');
      }
    }

    if (sub === 'eliminar') {
      const panelId = interaction.options.getString('nombre');
      await supabase.from('panels').delete().eq('id', panelId).eq('guild_id', interaction.guild.id);
      return interaction.reply({ content: '🗑️ Panel eliminado.', ephemeral: true });
    }

    if (sub === 'listar') {
      const panels = await getPanels(interaction.guild.id);
      if (!panels.length) return interaction.reply({ content: 'No hay paneles configurados.', ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle('Paneles')
        .setColor('#5865F2')
        .setDescription(
          panels
            .map((p) => `**${p.name}** · <#${p.channel_id}>${p.message_id ? ' · enviado ✅' : ' · sin enviar'}`)
            .join('\n')
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
