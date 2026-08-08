const {
  ChannelType,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
  AttachmentBuilder,
} = require('discord.js');
const supabase = require('../lib/supabase');

// ---------- helpers de datos ----------

async function getGuildConfig(guildId) {
  const { data } = await supabase.from('guilds').select('*').eq('id', guildId).single();
  return data;
}

async function getDepartments(guildId) {
  const { data } = await supabase
    .from('departments')
    .select('*')
    .eq('guild_id', guildId)
    .order('position', { ascending: true });
  return data || [];
}

async function getPriorities(guildId) {
  const { data } = await supabase
    .from('priorities')
    .select('*')
    .eq('guild_id', guildId)
    .order('position', { ascending: true });
  return data || [];
}

async function getTicketByChannel(channelId) {
  const { data } = await supabase.from('tickets').select('*').eq('channel_id', channelId).single();
  return data;
}

async function nextTicketNumber(guildId) {
  const { data } = await supabase
    .from('ticket_counters')
    .select('last_number')
    .eq('guild_id', guildId)
    .single();

  const next = (data?.last_number || 0) + 1;

  await supabase
    .from('ticket_counters')
    .upsert({ guild_id: guildId, last_number: next }, { onConflict: 'guild_id' });

  return next;
}

async function isStaffMember(member, guildConfig, department) {
  if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;

  const { data: staffRoles } = await supabase
    .from('staff_roles')
    .select('role_id')
    .eq('guild_id', guildConfig.id);

  const globalStaffIds = (staffRoles || []).map((r) => r.role_id);
  if (department?.staff_role_id) globalStaffIds.push(department.staff_role_id);

  return member.roles.cache.some((r) => globalStaffIds.includes(r.id));
}

// ---------- componentes ----------

function buildControlRow(status) {
  const row = new ActionRowBuilder();

  if (status === 'claimed') {
    row.addComponents(
      new ButtonBuilder().setCustomId('ticket_unclaim').setLabel('Quitar reclamación').setEmoji('🙌').setStyle(ButtonStyle.Secondary)
    );
  } else {
    row.addComponents(
      new ButtonBuilder().setCustomId('ticket_claim').setLabel('Reclamar').setEmoji('🙋').setStyle(ButtonStyle.Success)
    );
  }

  row.addComponents(
    new ButtonBuilder().setCustomId('ticket_manage').setLabel('Gestionar').setEmoji('⚙️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket_close').setLabel('Cerrar').setEmoji('🔒').setStyle(ButtonStyle.Danger)
  );

  return row;
}

function buildPriorityRow(priorities, selectedId) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket_priority')
    .setPlaceholder('Cambiar prioridad')
    .addOptions(
      priorities.map((p) => ({
        label: p.name,
        value: p.id,
        emoji: p.emoji || undefined,
        default: p.id === selectedId,
      }))
    );
  return new ActionRowBuilder().addComponents(menu);
}

async function buildTicketPanelEmbed(panel, departments) {
  const embed = new EmbedBuilder()
    .setTitle(panel.title || 'Soporte')
    .setDescription(panel.description || 'Pulsa el botón de tu departamento para abrir un ticket.')
    .setColor(panel.color || '#2b2d31');

  if (panel.image_url) embed.setImage(panel.image_url);
  if (panel.thumbnail_url) embed.setThumbnail(panel.thumbnail_url);
  if (panel.footer) embed.setFooter({ text: panel.footer });

  const rows = [];

  if (panel.select_mode) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`open_ticket_select:${panel.id}`)
      .setPlaceholder('Selecciona un departamento')
      .addOptions(
        departments.map((pd) => ({
          label: pd.label || pd.departments.name,
          value: pd.department_id,
          emoji: pd.emoji || pd.departments.emoji || undefined,
        }))
      );
    rows.push(new ActionRowBuilder().addComponents(menu));
  } else {
    let row = new ActionRowBuilder();
    departments.forEach((pd, i) => {
      if (i > 0 && i % 5 === 0) {
        rows.push(row);
        row = new ActionRowBuilder();
      }
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`open_ticket:${pd.department_id}`)
          .setLabel(pd.label || pd.departments.name)
          .setEmoji(pd.emoji || pd.departments.emoji || undefined)
          .setStyle(ButtonStyle[capitalize(pd.style || 'primary')])
      );
    });
    rows.push(row);
  }

  return { embeds: [embed], components: rows };
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------- acciones principales ----------

async function createTicket(interaction, departmentId) {
  const guild = interaction.guild;
  const guildConfig = await getGuildConfig(guild.id);
  const departments = await getDepartments(guild.id);
  const department = departments.find((d) => d.id === departmentId);

  if (!department) {
    return interaction.reply({ content: 'Ese departamento ya no existe.', ephemeral: true });
  }

  // límite de tickets abiertos por usuario
  const { data: openTickets } = await supabase
    .from('tickets')
    .select('id')
    .eq('guild_id', guild.id)
    .eq('opener_id', interaction.user.id)
    .in('status', ['open', 'claimed']);

  const maxOpen = guildConfig.max_open_per_user || 1;
  if (openTickets && openTickets.length >= maxOpen) {
    return interaction.reply({
      content: `Ya tienes ${openTickets.length} ticket(s) abierto(s). Ciérralos antes de abrir otro.`,
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  const number = await nextTicketNumber(guild.id);
  const name = (guildConfig.ticket_name_format || 'ticket-{n}').replace('{n}', number);
  const categoryId = department.category_id || guildConfig.category_open_fallback || null;

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    {
      id: interaction.user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AttachFiles,
      ],
    },
    {
      id: interaction.client.user.id,
      allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.SendMessages],
    },
  ];

  if (department.staff_role_id) {
    overwrites.push({
      id: department.staff_role_id,
      allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
    });
  }

  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: categoryId || undefined,
    permissionOverwrites: overwrites,
    topic: `Ticket de ${interaction.user.tag} · Depto: ${department.name}`,
  });

  const priorities = await getPriorities(guild.id);
  const defaultPriority = priorities.find((p) => p.is_default) || priorities[0];

  const { data: ticket } = await supabase
    .from('tickets')
    .insert({
      guild_id: guild.id,
      channel_id: channel.id,
      number,
      department_id: department.id,
      priority_id: defaultPriority?.id || null,
      opener_id: interaction.user.id,
      status: 'open',
    })
    .select()
    .single();

  const embed = new EmbedBuilder()
    .setTitle(`${department.emoji || '📁'} ${department.name}`)
    .setDescription(guildConfig.welcome_message || '¡Gracias por abrir un ticket! Un miembro del staff te atenderá pronto.')
    .setColor(defaultPriority?.color || '#2b2d31')
    .addFields(
      { name: 'Abierto por', value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Prioridad', value: `${defaultPriority?.emoji || ''} ${defaultPriority?.name || 'Sin definir'}`, inline: true }
    );

  const rows = [buildControlRow('open')];
  if (priorities.length) rows.push(buildPriorityRow(priorities, defaultPriority?.id));

  await channel.send({
    content: `<@${interaction.user.id}>${department.staff_role_id ? ` · <@&${department.staff_role_id}>` : ''}`,
    embeds: [embed],
    components: rows,
  });

  await interaction.editReply({ content: `Ticket creado: <#${channel.id}>` });
}

async function claimTicket(interaction) {
  const ticket = await getTicketByChannel(interaction.channel.id);
  if (!ticket) return interaction.reply({ content: 'Esto no es un ticket.', ephemeral: true });
  if (ticket.status === 'claimed') {
    return interaction.reply({ content: `Ya está reclamado por <@${ticket.claimed_by}>.`, ephemeral: true });
  }

  const guildConfig = await getGuildConfig(interaction.guild.id);
  const departments = await getDepartments(interaction.guild.id);
  const department = departments.find((d) => d.id === ticket.department_id);

  if (!(await isStaffMember(interaction.member, guildConfig, department))) {
    return interaction.reply({ content: 'No tienes permiso para reclamar este ticket.', ephemeral: true });
  }

  await supabase
    .from('tickets')
    .update({ status: 'claimed', claimed_by: interaction.user.id, claimed_at: new Date().toISOString() })
    .eq('id', ticket.id);

  const prefix = guildConfig.claimed_prefix || 'reclamado';
  const baseName = interaction.channel.name.replace(/^[a-z-]+-(?=\d)/, '').split('-').pop();
  try {
    await interaction.channel.setName(`${prefix}-${baseName}`);
  } catch (_) {}

  await interaction.reply({ content: `🙋 Ticket reclamado por <@${interaction.user.id}>.` });

  const msgs = await interaction.channel.messages.fetch({ limit: 10 });
  const controlMsg = msgs.find((m) => m.author.id === interaction.client.user.id && m.components.length);
  if (controlMsg) {
    const priorities = await getPriorities(interaction.guild.id);
    const rows = [buildControlRow('claimed')];
    if (priorities.length) rows.push(buildPriorityRow(priorities, ticket.priority_id));
    await controlMsg.edit({ components: rows });
  }
}

async function unclaimTicket(interaction) {
  const ticket = await getTicketByChannel(interaction.channel.id);
  if (!ticket) return interaction.reply({ content: 'Esto no es un ticket.', ephemeral: true });

  const guildConfig = await getGuildConfig(interaction.guild.id);
  const departments = await getDepartments(interaction.guild.id);
  const department = departments.find((d) => d.id === ticket.department_id);

  const canUnclaim =
    ticket.claimed_by === interaction.user.id || (await isStaffMember(interaction.member, guildConfig, department));

  if (!canUnclaim) {
    return interaction.reply({ content: 'No puedes quitar esta reclamación.', ephemeral: true });
  }

  await supabase.from('tickets').update({ status: 'open', claimed_by: null, claimed_at: null }).eq('id', ticket.id);

  const original = `ticket-${ticket.number}`;
  try {
    await interaction.channel.setName(original);
  } catch (_) {}

  await interaction.reply({ content: '🙌 Reclamación retirada.' });

  const msgs = await interaction.channel.messages.fetch({ limit: 10 });
  const controlMsg = msgs.find((m) => m.author.id === interaction.client.user.id && m.components.length);
  if (controlMsg) {
    const priorities = await getPriorities(interaction.guild.id);
    const rows = [buildControlRow('open')];
    if (priorities.length) rows.push(buildPriorityRow(priorities, ticket.priority_id));
    await controlMsg.edit({ components: rows });
  }
}

async function closeTicket(interaction, reason) {
  const ticket = await getTicketByChannel(interaction.channel.id);
  if (!ticket) return interaction.reply({ content: 'Esto no es un ticket.', ephemeral: true });

  await interaction.deferReply();

  const guildConfig = await getGuildConfig(interaction.guild.id);

  // transcript básico en texto plano
  const messages = await interaction.channel.messages.fetch({ limit: 100 });
  const sorted = [...messages.values()].reverse();
  const lines = sorted.map((m) => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content || '[embed/adjunto]'}`);
  const transcriptText = lines.join('\n');
  const attachment = new AttachmentBuilder(Buffer.from(transcriptText, 'utf-8'), {
    name: `${interaction.channel.name}.txt`,
  });

  if (guildConfig.transcripts_channel_id) {
    const logChannel = interaction.guild.channels.cache.get(guildConfig.transcripts_channel_id);
    if (logChannel) {
      await logChannel.send({
        content: `📄 Transcript de **${interaction.channel.name}** · cerrado por <@${interaction.user.id}>${
          reason ? `\nMotivo: ${reason}` : ''
        }`,
        files: [attachment],
      });
    }
  }

  await supabase
    .from('tickets')
    .update({
      status: 'closed',
      closed_by: interaction.user.id,
      closed_at: new Date().toISOString(),
      close_reason: reason || null,
    })
    .eq('id', ticket.id);

  await interaction.editReply('🔒 Cerrando ticket en 5 segundos...');
  setTimeout(async () => {
    try {
      await interaction.channel.delete();
    } catch (_) {}
  }, 5000);
}

async function transferTicket(interaction, newDepartmentId) {
  const ticket = await getTicketByChannel(interaction.channel.id);
  if (!ticket) return interaction.reply({ content: 'Esto no es un ticket.', ephemeral: true });

  const departments = await getDepartments(interaction.guild.id);
  const newDept = departments.find((d) => d.id === newDepartmentId);
  const oldDept = departments.find((d) => d.id === ticket.department_id);
  if (!newDept) return interaction.reply({ content: 'Departamento no válido.', ephemeral: true });

  if (newDept.category_id) {
    try {
      await interaction.channel.setParent(newDept.category_id, { lockPermissions: false });
    } catch (_) {}
  }

  // quitar acceso al rol de staff antiguo, dar acceso al nuevo
  if (oldDept?.staff_role_id) {
    try {
      await interaction.channel.permissionOverwrites.delete(oldDept.staff_role_id);
    } catch (_) {}
  }
  if (newDept.staff_role_id) {
    try {
      await interaction.channel.permissionOverwrites.edit(newDept.staff_role_id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });
    } catch (_) {}
  }

  await supabase
    .from('tickets')
    .update({ department_id: newDept.id, status: 'open', claimed_by: null, claimed_at: null })
    .eq('id', ticket.id);

  await supabase.from('ticket_transfers').insert({
    ticket_id: ticket.id,
    from_department_id: oldDept?.id || null,
    to_department_id: newDept.id,
    transferred_by: interaction.user.id,
  });

  await interaction.channel.send(
    `➡️ Ticket transferido a **${newDept.name}**${newDept.staff_role_id ? ` · <@&${newDept.staff_role_id}>` : ''} por <@${interaction.user.id}>.`
  );
}

async function updatePriority(interaction, priorityId) {
  const ticket = await getTicketByChannel(interaction.channel.id);
  if (!ticket) return interaction.reply({ content: 'Esto no es un ticket.', ephemeral: true });

  const priorities = await getPriorities(interaction.guild.id);
  const priority = priorities.find((p) => p.id === priorityId);
  if (!priority) return interaction.reply({ content: 'Prioridad no válida.', ephemeral: true });

  await supabase.from('tickets').update({ priority_id: priority.id }).eq('id', ticket.id);

  await interaction.reply({ content: `Prioridad actualizada a ${priority.emoji || ''} **${priority.name}**.` });

  const msgs = await interaction.channel.messages.fetch({ limit: 10 });
  const controlMsg = msgs.find((m) => m.author.id === interaction.client.user.id && m.embeds.length && m.components.length);
  if (controlMsg) {
    const embed = EmbedBuilder.from(controlMsg.embeds[0])
      .setColor(priority.color || '#2b2d31')
      .spliceFields(1, 1, { name: 'Prioridad', value: `${priority.emoji || ''} ${priority.name}`, inline: true });
    const rows = [buildControlRow(ticket.status === 'claimed' ? 'claimed' : 'open'), buildPriorityRow(priorities, priority.id)];
    await controlMsg.edit({ embeds: [embed], components: rows });
  }
}

module.exports = {
  getGuildConfig,
  getDepartments,
  getPriorities,
  getTicketByChannel,
  isStaffMember,
  buildControlRow,
  buildPriorityRow,
  buildTicketPanelEmbed,
  createTicket,
  claimTicket,
  unclaimTicket,
  closeTicket,
  transferTicket,
  updatePriority,
};
