const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const supabase = require('../lib/supabase');
const {
  createTicket,
  claimTicket,
  unclaimTicket,
  closeTicket,
  transferTicket,
  updatePriority,
  getDepartments,
} = require('../handlers/ticketHandlers');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    try {
      // ---------- slash commands ----------
      if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) return;
        return command.execute(interaction);
      }

      if (interaction.isAutocomplete()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (command?.autocomplete) return command.autocomplete(interaction);
        return;
      }

      // ---------- modales ----------
      if (interaction.isModalSubmit() && interaction.customId === 'ajustes_texto_modal') {
        const ticketNameFormat = interaction.fields.getTextInputValue('ticket_name_format');
        const claimedPrefix = interaction.fields.getTextInputValue('claimed_prefix');
        const maxOpenRaw = interaction.fields.getTextInputValue('max_open_per_user');
        const welcomeMessage = interaction.fields.getTextInputValue('welcome_message');

        const maxOpen = parseInt(maxOpenRaw, 10);
        if (isNaN(maxOpen) || maxOpen < 1) {
          return interaction.reply({ content: 'El máximo de tickets debe ser un número mayor que 0.', ephemeral: true });
        }

        await supabase
          .from('guilds')
          .update({
            ticket_name_format: ticketNameFormat,
            claimed_prefix: claimedPrefix,
            max_open_per_user: maxOpen,
            welcome_message: welcomeMessage,
          })
          .eq('id', interaction.guild.id);

        return interaction.reply({ content: '✅ Ajustes guardados.', ephemeral: true });
      }

      // ---------- elegir departamentos de un panel recién creado ----------
      if (interaction.isStringSelectMenu() && interaction.customId.startsWith('panel_depts_select:')) {
        const panelId = interaction.customId.split(':')[1];
        const departmentIds = interaction.values;

        await supabase.from('panel_departments').delete().eq('panel_id', panelId);
        const rows = departmentIds.map((id, i) => ({ panel_id: panelId, department_id: id, position: i }));
        await supabase.from('panel_departments').insert(rows);

        return interaction.update({
          content: `✅ Departamentos guardados (${departmentIds.length}). Usa \`/panel enviar\` para publicarlo.`,
          components: [],
        });
      }

      // ---------- abrir ticket: botón ----------
      if (interaction.isButton() && interaction.customId.startsWith('open_ticket:')) {
        const departmentId = interaction.customId.split(':')[1];
        return createTicket(interaction, departmentId);
      }

      // ---------- abrir ticket: select menu ----------
      if (interaction.isStringSelectMenu() && interaction.customId.startsWith('open_ticket_select:')) {
        const departmentId = interaction.values[0];
        return createTicket(interaction, departmentId);
      }

      // ---------- reclamar / quitar reclamación ----------
      if (interaction.isButton() && interaction.customId === 'ticket_claim') {
        return claimTicket(interaction);
      }
      if (interaction.isButton() && interaction.customId === 'ticket_unclaim') {
        return unclaimTicket(interaction);
      }

      // ---------- cerrar ----------
      if (interaction.isButton() && interaction.customId === 'ticket_close') {
        return closeTicket(interaction, null);
      }

      // ---------- gestionar (abre menú de transferencia) ----------
      if (interaction.isButton() && interaction.customId === 'ticket_manage') {
        const departments = await getDepartments(interaction.guild.id);
        if (!departments.length) {
          return interaction.reply({ content: 'No hay departamentos configurados.', ephemeral: true });
        }
        const menu = new StringSelectMenuBuilder()
          .setCustomId('ticket_transfer_select')
          .setPlaceholder('Transferir a...')
          .addOptions(
            departments.map((d) => ({ label: d.name, value: d.id, emoji: d.emoji || undefined }))
          );
        return interaction.reply({
          content: 'Selecciona el departamento al que quieres transferir este ticket:',
          components: [new ActionRowBuilder().addComponents(menu)],
          ephemeral: true,
        });
      }

      // ---------- confirmar transferencia ----------
      if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_transfer_select') {
        const departmentId = interaction.values[0];
        await transferTicket(interaction, departmentId);
        return interaction.update({ content: '✅ Ticket transferido.', components: [] });
      }

      // ---------- cambiar prioridad ----------
      if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_priority') {
        const priorityId = interaction.values[0];
        return updatePriority(interaction, priorityId);
      }
    } catch (err) {
      console.error('Error en interactionCreate:', err);
      const payload = { content: 'Ha ocurrido un error procesando la acción.', ephemeral: true };
      if (interaction.deferred || interaction.replied) {
        interaction.followUp(payload).catch(() => {});
      } else {
        interaction.reply(payload).catch(() => {});
      }
    }
  },
};
