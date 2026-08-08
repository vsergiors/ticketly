const supabase = require('../lib/supabase');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`✅ Bot conectado como ${client.user.tag}`);

    // sincroniza todos los servers en los que ya está el bot (por si se cayó/reinició)
    for (const [id, guild] of client.guilds.cache) {
      await supabase.from('guilds').upsert(
        {
          id,
          name: guild.name,
          icon: guild.iconURL(),
          owner_id: guild.ownerId,
        },
        { onConflict: 'id', ignoreDuplicates: false }
      );
    }
  },
};
