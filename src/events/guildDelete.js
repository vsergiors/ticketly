const supabase = require('../lib/supabase');

module.exports = {
  name: 'guildDelete',
  async execute(guild) {
    // no borramos datos, solo lo dejamos constar; puedes cambiar a delete si prefieres limpiar
    console.log(`➖ Bot expulsado de ${guild.name} (${guild.id})`);
  },
};
