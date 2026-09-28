"""Validate Theme Factory manifest without Blender: python theme-factory/validate.py"""
import json
from pathlib import Path

path=Path(__file__).parent/"themes/night-market.json"
data=json.loads(path.read_text())
assert data["schemaVersion"]==1
assert data["numericLabels"] is False, "Tile silhouettes, not numeric overlays, identify levels"
assert data["board"]["cells"]==4
levels=data["levels"]
assert len(levels)==3 and len({x["value"] for x in levels})==3
assert [x["value"] for x in levels]==[2,128,2048]
assert len({x["id"] for x in levels})==len(levels)
for tile in levels:
    assert len(tile["palette"])==3 and all(len(x)==7 and x.startswith("#") for x in tile["palette"])
    assert 0.5<=tile["scale"]<=1.0
for key in ("maxTrianglesPerTile","maxMaterialsPerTile","maxAssetBytes","maxBoardTriangles"):
    assert data["budgets"][key]>0
print("Night Market manifest: PASS")
