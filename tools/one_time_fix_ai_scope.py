from pathlib import Path

p = Path('web/app/ai.js')
s = p.read_text()

old_state = "    loadedModel:null,progress:0,progressText:'Model not loaded.',conversation:[],lastPacket:null,"
new_state = "    loadedModel:null,progress:0,progressText:'Model not loaded.',executionBackend:'pending',cacheBackend:'pending',conversation:[],lastPacket:null,"
if old_state not in s:
    raise SystemExit('AI state anchor not found')
s = s.replace(old_state, new_state, 1)

s = s.replace('AI.executionBackend', 'ai.executionBackend')
s = s.replace('AI.cacheBackend', 'ai.cacheBackend')

if 'AI.executionBackend' in s or 'AI.cacheBackend' in s:
    raise SystemExit('stale undefined AI state references remain')
if "executionBackend:'pending',cacheBackend:'pending'" not in s:
    raise SystemExit('new AI runtime state fields missing')

p.write_text(s)
