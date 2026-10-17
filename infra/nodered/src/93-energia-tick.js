// @name Potencia y energía (cada 1 s)
// @kind tick
// Suma base + luces + A/C + enchufes e integra los kWh del medidor general.
// cfg.METER.energyTimeScale acelera la integración (60 → 1 s real = 1 min simulado).
const M = cfg.METER;
const base = M.baseLoadW + 6 * Math.sin(now / 9000) + (Math.random() - 0.5) * 4;   // nevera + standby

let lights = 0;
for (const l of Object.values(S.lights)) if (l.on) lights += (l.intensity / 100) * M.lightMaxW;

let ac = 0;
for (const a of Object.values(S.acs)) ac += a.watts;

let plugs = 0;
for (const def of cfg.PLUGS) {
  const p = S.plugs[def.id];
  const w = !p.on ? 0 : def.profile === 'cycle'
    ? def.watts * (0.35 + 0.65 * Math.abs(Math.sin(now / 4000)))     // lavado / centrifugado
    : def.watts * (0.94 + Math.random() * 0.12);
  const prev = S.last.plug[def.id];
  p.watts = Math.round(w);
  p.kwh += (p.watts / 3600 / 1000) * M.energyTimeScale;               // kWh = W·h/1000
  plugs += p.watts;
  if (p.on || !prev || prev.watts !== p.watts) {
    S.last.plug[def.id] = { watts: p.watts };
    out.push({ type: 'plug', id: def.id, patch: { watts: p.watts, kwh: p.kwh } });
  }
}

const breakdown = { base: round(base, 1), lights: round(lights, 1), ac: Math.round(ac), plugs: Math.round(plugs) };
const watts = round(breakdown.base + breakdown.lights + breakdown.ac + breakdown.plugs, 1);
S.kwh += (watts / 3600 / 1000) * M.energyTimeScale;
S.lastPower = { ts: now, watts, kwhTotal: S.kwh, breakdown };

out.push({ type: 'power', ts: now, watts, kwhTotal: S.kwh, breakdown });
return done();
