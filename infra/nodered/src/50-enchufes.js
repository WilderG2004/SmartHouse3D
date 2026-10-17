// @name Enchufes inteligentes
// @kind handler
// Comando: { kind:'plug.set', id, on, reason?, quiet? }   reason:'timer' = apagado automático
const def = cfg.PLUGS.find((p) => p.id === cmd.id);
const st = S.plugs[cmd.id];
if (!def || !st || st.on === !!cmd.on) return null;

st.on = !!cmd.on;
st.watts = st.on ? def.watts : 0;
st.offAt = st.on && def.autoOffSec ? now + def.autoOffSec * 1000 : null;
out.push({ type: 'plug', id: def.id, patch: { on: st.on, watts: st.watts } });

if (cmd.reason === 'timer') log('info', def.label, 'Apagado automático (temporizador de ' + def.autoOffSec + ' s)');
else log('info', def.label, st.on ? 'Enchufe encendido' : 'Enchufe apagado', cmd.quiet);
return done();
