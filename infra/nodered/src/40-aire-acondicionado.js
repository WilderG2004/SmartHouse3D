// @name Aire acondicionado (comandos)
// @kind handler
// Comando: { kind:'ac.set', id, patch:{ on?, mode?, setpoint?, fan? }, quiet? }
// El termostato (compresor on/off) corre cada segundo en el nodo «Clima y termostato».
const ac = S.acs[cmd.id];
const def = cfg.AIR_CONDITIONERS.find((a) => a.id === cmd.id);
if (!ac || !def || !cmd.patch) return null;

const p = cmd.patch;
const prev = Object.assign({}, ac);
if (p.on !== undefined) ac.on = !!p.on;
if (p.mode === 'cool' || p.mode === 'fan') ac.mode = p.mode;
if (p.fan === 'low' || p.fan === 'mid' || p.fan === 'high') ac.fan = p.fan;
if (p.setpoint !== undefined) ac.setpoint = clamp(Math.round(Number(p.setpoint) || 24), cfg.CLIMATE.acSetpointMin, cfg.CLIMATE.acSetpointMax);
if (!ac.on) { ac.running = false; ac.watts = 0; }
if (p.on !== undefined || p.setpoint !== undefined || p.mode !== undefined) delete S.acReached[ac.id];

out.push({ type: 'ac', id: ac.id, patch: { on: ac.on, mode: ac.mode, setpoint: ac.setpoint, fan: ac.fan, running: ac.running, watts: ac.watts } });

const who = 'A/C ' + def.label;
if (ac.on !== prev.on) log('info', who, ac.on ? 'Encendido · ' + (ac.mode === 'cool' ? 'frío a ' + ac.setpoint + ' °C' : 'ventilador') : 'Apagado', cmd.quiet);
else if (ac.mode !== prev.mode) log('info', who, ac.mode === 'cool' ? 'Modo frío' : 'Modo ventilador', cmd.quiet);
return done();
