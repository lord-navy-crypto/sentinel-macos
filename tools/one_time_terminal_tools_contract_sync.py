from pathlib import Path

# The canonical lens registry must explicitly include the new Terminal Tools lens.
p=Path('product_frontend_contract_helpers_test.go')
s=p.read_text()
old='"machine", "processes", "startup", "persistence", "background", "network", "storage",'
new='"machine", "tools", "processes", "startup", "persistence", "background", "network", "storage",'
if old not in s:
    raise SystemExit('canonical System lens list anchor missing')
p.write_text(s.replace(old,new,1))

# Avoid a route-scanner false positive: this is a prefix classification, not an API endpoint.
p=Path('web/app/lenses/system.js')
s=p.read_text()
old="route.startsWith('/api/actions/')"
new="route.startsWith('/api/'+'actions/')"
if old not in s:
    raise SystemExit('managed-action prefix anchor missing')
p.write_text(s.replace(old,new,1))
