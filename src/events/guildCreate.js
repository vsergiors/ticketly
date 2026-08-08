const supabase = require('../lib/supabase');

module.exports = {
  name: 'guildCreate',
  async execute(guild) {
    await supabase.from('guilds').upsert(
      { id: guild.id, name: guild.name, icon: guild.iconURL(), owner_id: guild.ownerId },
      { onConflict: 'id' }
    );

    // prioridades por defecto para que el panel no arranque vacío
    const { data: existing } = await supabase.from('priorities').select('id').eq('guild_id', guild.id);
    if (!existing || existing.length === 0) {
      await supabase.from('priorities').insert([
        { guild_id: guild.id, name: 'Baja', emoji: '🟢', color: '#2ecc71', position: 0 },
        { guild_id: guild.id, name: 'Media', emoji: '🟡', color: '#f1c40f', position: 1, is_default: true },
        { guild_id: guild.id, name: 'Alta', emoji: '🟠', color: '#e67e22', position: 2 },
        { guild_id: guild.id, name: 'Urgente', emoji: '🔴', color: '#e74c3c', position: 3 },
      ]);
    }

    console.log(`➕ Bot añadido a ${guild.name} (${guild.id})`);
  },
};
