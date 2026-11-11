# SPDX-License-Identifier: GPL-3.0-or-later
# REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
# Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
"""Apply outside fillets without adding material to functional clearances.
Recovered 2026-11-10 from the Codex thread (Oct 11 13:01 version): convex_edges and acceptable, the two functions the
inline / solid-half / split rail mount builds import."""
import FreeCAD as App
import Part,MeshPart
from FreeCAD import Vector as V

def convex_edges(s,min_length=1.5):
    result=[]
    for e in s.Edges:
        if e.Length<min_length: continue
        faces=[f for f in s.Faces if any(e.isSame(k) for k in f.Edges)]
        if len(faces)!=2: continue
        p=e.valueAt((e.FirstParameter+e.LastParameter)/2)
        try:
            a,b=[f.normalAt(*f.Surface.parameter(p)) for f in faces]
            if abs(a.dot(b))>.999: continue
            if s.isInside(p+(a-b)*.03,1e-6,True) or s.isInside(p+(b-a)*.03,1e-6,True): continue
            result.append(e)
        except Exception: pass
    return result

def acceptable(s):
    if not s.isValid() or len(s.Solids)!=1: return False
    m=MeshPart.meshFromShape(Shape=s,LinearDeflection=.06,AngularDeflection=.15,Relative=False)
    return m.isSolid() and not m.hasNonManifolds() and not m.hasSelfIntersections()
