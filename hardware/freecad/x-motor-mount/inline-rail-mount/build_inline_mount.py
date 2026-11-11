"""R9 direct-drive mount. Dimensions in mm, original R9 assembly coordinates.
Edit parameters.json and rebuild with FreeCAD's bundled Python.
Three printed pieces: main bracket + two identical caps.
Hardware envelopes are references, not manufactured component CAD.
"""
import FreeCAD as App
import Part, MeshPart
from FreeCAD import Vector as V
from pathlib import Path
import json, math, hashlib
from fillet_edges import convex_edges
OUT=Path(__file__).resolve().parent
C=json.loads((OUT/'parameters.json').read_text(encoding='utf-8-sig'))
src=(OUT/'r9_source_snapshot.py').read_text().replace('\nmain()\n','\n')
g={'__name__':'r9_baseline','__file__':str(OUT/'r9_source_snapshot.py'),'P_OVERRIDE':{'long_x':True}}
exec(compile(src,'r9_baseline','exec'),g)
P=g['P']
T=g['XHALF']; Z=g['XA']; RY=g['XRAIL_Y']; RD=g['XRAIL_D']; SD=P['xscrew_dia_in']*25.4
start=T+C['nominal_clamp_offset_mm']; end=start+C['clamp_grip_length_mm']
couple_start=end+C['coupler_from_clamp_end_mm']; couple_centre=couple_start+C['coupler_length_mm']/2
screw_tip=couple_centre-C['shaft_end_gap_mm']/2
motor_tip=couple_centre+C['shaft_end_gap_mm']/2
front=motor_tip+C['motor_shaft_projection_mm']; back=front-C['motor_plate_thickness_mm']
bottom=Z-9.5; arm_top=Z+15.5; plate_bottom=Z-27.15; plate_top=Z+27.15
checks=[]
def check(name,ok,detail=None):
    checks.append({'name':name,'passed':bool(ok),'detail':detail})
    if not ok: print('FAILED',name,detail,flush=True)
def clear(name,a,b):
    vol=a.common(b).Volume
    check(name,vol<1e-5,{'intersection_mm3':vol,'gap_mm':a.distToShape(b)[0]})
def box(x0,x1,y0,y1,z0,z1): return Part.makeBox(x1-x0,y1-y0,z1-z0,V(x0,y0,z0))
def cylinder(r,x0,x1,y=0,z=Z): return Part.makeCylinder(r,x1-x0,V(x0,y,z),V(1,0,0))
def zcylinder(r,z0,z1,x,y): return Part.makeCylinder(r,z1-z0,V(x,y,z0))
def move(s,dx=0,dy=0,dz=0):
    t=s.copy();t.translate(V(dx,dy,dz));return t
def hex_socket(x,y,z,h,af):
    r=af/math.sqrt(3)
    p=[V(x+r*math.cos(math.pi/6+i*math.pi/3),y+r*math.sin(math.pi/6+i*math.pi/3),z) for i in range(6)]
    return Part.Face(Part.makePolygon(p+[p[0]])).extrude(V(0,0,h))
def tri_gusset(y0,y1,points):
    p=[V(x,y0,z) for x,z in points]
    return Part.Face(Part.makePolygon(p+[p[0]])).extrude(V(0,y1-y0,0))
def rounded(s,kind):
    old=s
    edges=[]
    for e in convex_edges(s,3):
        b=e.BoundBox
        if type(e.Curve).__name__!='Line': continue
        if kind=='main' and b.XLength>1 and b.YLength<1e-6 and b.ZLength<1e-6:
            if abs(abs(b.YMin)-33.5)<1e-6 and min(abs(b.ZMin-plate_bottom),abs(b.ZMin-plate_top))<1e-6: edges.append(e)
        if kind=='cap' and b.ZLength>1 and b.XLength<1e-6 and b.YLength<1e-6: edges.append(e)
    s=s.makeFillet(2,edges).removeSplitter()
    stats={'corner_radius_mm':2,'corner_edges':len(edges),'edge_rounds':[]}
    # Keep rail seats, bolt holes, nut pockets and the clamp split faces exact.
    def eligible(e):
        if type(e.Curve).__name__!='Line' or e.Length<2: return False
        p=e.valueAt((e.FirstParameter+e.LastParameter)/2);b=e.BoundBox
        if kind=='main':
            if b.ZLength<1e-6 and abs(p.z-(Z-C['split_gap_mm']/2))<.01: return False
            if p.x<end+.01 and abs(p.y)<26 and p.z>Z-6: return False
            if p.x<end+.01 and abs(p.z-bottom)<.01 and abs(p.x-(start+10))<4: return False
            if abs(p.x-(start+10))<3.5 and any(abs(p.y-y)<3.6 for y in (-28,-10,10,28)): return False
        else:
            if abs(p.z-(Z+C['split_gap_mm']/2))<.01: return False
            if abs(p.x-(start+10))<3.5 and any(abs(p.y-y)<3.6 for y in (10,28)): return False
            if abs(p.y-RY)<6 and p.z<Z+6: return False
        return True
    sig=[(e.valueAt((e.FirstParameter+e.LastParameter)/2),type(e.Curve).__name__) for e in convex_edges(s) if eligible(e)]
    def match(p,k):
        for e in s.Edges:
            if type(e.Curve).__name__!=k: continue
            b=e.BoundBox
            if b.XMin-1e-6<=p.x<=b.XMax+1e-6 and b.YMin-1e-6<=p.y<=b.YMax+1e-6 and b.ZMin-1e-6<=p.z<=b.ZMax+1e-6 and Part.Vertex(p).distToShape(e)[0]<1e-6: return e
    def apply(group):
        nonlocal s
        live=[e for e in (match(p,k) for p,k in group) if e is not None]
        if not live:return
        try:
            t=s.makeFillet(.6,live).removeSplitter()
            if not t.isValid() or len(t.Solids)!=1 or t.Volume>s.Volume+.01: raise ValueError('bad fillet')
            s=t;stats['edge_rounds'].append(len(live));return
        except Exception:
            if len(group)>1:
                n=len(group)//2;apply(group[:n]);apply(group[n:])
    apply(sig)
    check(kind+' rounded valid single solid',s.isValid() and len(s.Solids)==1)
    check(kind+' rounds only remove material',s.cut(old).Volume<1e-5,s.cut(old).Volume)
    print('Rounded',kind,stats,flush=True)
    return s,stats
parts=[]
for y in (-RY,RY):
    parts.append(box(start,end,y-14.5,y+14.5,bottom,Z-C['split_gap_mm']/2))
for ya,yb in ((25.5,33.5),(-33.5,-25.5)):
    parts.append(box(end,back,ya,yb,bottom,arm_top))
    parts.append(tri_gusset(ya,yb,[(back,bottom),(back-10,bottom),(back,bottom-8)]))
    parts.append(tri_gusset(ya,yb,[(back,arm_top),(back-10,arm_top),(back,arm_top+8)]))
parts.append(box(back,front,-33.5,33.5,plate_bottom,plate_top))
main=parts[0].multiFuse(parts[1:]).removeSplitter()
cap=box(start+.2,end-.2,RY-14.5,RY+14.5,Z+C['split_gap_mm']/2,Z+9.5)
bore=(RD+C['rail_bore_clearance_mm'])/2
for y in (-RY,RY): main=main.cut(cylinder(bore,start-1,end+1,y))
cap=cap.cut(cylinder(bore,start-1,end+1,RY))
relief=cylinder(5.5,start-1,front+1)
main=main.cut(relief);cap=cap.cut(relief)
bolts=[]
for ry in (-RY,RY):
    for y in (ry-9,ry+9):
        x=(start+end)/2;bolts.append((x,y))
        main=main.cut(zcylinder(1.7,bottom-1,Z+10,x,y))
        main=main.cut(hex_socket(x,y,bottom-.01,2.51,5.7))
        if ry>0:cap=cap.cut(zcylinder(1.7,Z,Z+11,x,y))
main=main.cut(cylinder(11.75,back-1,front+1))
for y in (-15.5,15.5):
    for z in (Z-15.5,Z+15.5):main=main.cut(cylinder(1.7,back-1,front+1,y,z))
main=main.removeSplitter();cap=cap.removeSplitter()
main,mainround=rounded(main,'main');cap,capround=rounded(cap,'cap')
capminus=cap.copy();capminus.rotate(V((start+end)/2,0,0),V(0,0,1),180)
motor=box(front,front+C['motor_body_depth_mm'],-21.15,21.15,Z-21.15,Z+21.15)
boss=cylinder(11,front-2,front)
shaft=cylinder(2.5,motor_tip,front)
coupler=cylinder(C['coupler_clearance_diameter_mm']/2,couple_start,couple_start+C['coupler_length_mm'])
coupler=coupler.cut(cylinder(SD/2,couple_start-1,couple_centre)).cut(cylinder(2.5,couple_centre,couple_start+C['coupler_length_mm']+1))
screw=cylinder(SD/2,T,screw_tip)
rails=[cylinder(RD/2,T,T+C['rail_projection_mm'],y) for y in (-RY,RY)]
min_shift=1-C['nominal_clamp_offset_mm']; max_shift=C['rail_projection_mm']-C['nominal_clamp_offset_mm']-C['clamp_grip_length_mm']
assert max_shift>min_shift
printedparts=[('main',main),('cap_positive',cap),('cap_negative',capminus)]
for delta in (min_shift,0,max_shift):
    m=move(main,dx=delta);cp=move(cap,dx=delta);cm=move(capminus,dx=delta)
    for label,s in [('main',m),('cap+',cp),('cap-',cm)]:
        for j,r in enumerate(rails):clear(f'{label} vs rail {j}, shift {delta}',s,r)
        clear(f'{label} vs screw, shift {delta}',s,cylinder(SD/2,T,screw_tip+delta))
        clear(f'{label} vs 11 mm screw clearance envelope, shift {delta}',s,cylinder(5.5,T,back+delta))
        clear(f'{label} vs motor, shift {delta}',s,move(motor,dx=delta))
        clear(f'{label} vs pilot, shift {delta}',s,move(boss,dx=delta))
        clear(f'{label} vs coupling, shift {delta}',s,move(coupler,dx=delta))
        clear(f'{label} vs oversized 24 mm coupling, shift {delta}',s,move(cylinder(12,couple_start,couple_start+C['coupler_length_mm']),dx=delta))
    clear(f'main/cap+ shift {delta}',m,cp);clear(f'main/cap- shift {delta}',m,cm)
    check(f'20 mm full rail engagement, shift {delta}',start+delta>=T+1-1e-6 and end+delta<=T+C['rail_projection_mm']+1e-6,[start+delta,end+delta])
    for r in rails:clear(f'motor clear trimmed rail shift {delta}',move(motor,dx=delta),r)
    # Vertical access to both coupling setscrews.
    for x in (couple_start+C['coupler_length_mm']*.25,couple_start+C['coupler_length_mm']*.75):
        tool=zcylinder(3,Z+7,Z+70,x+delta,0)
        for label,s in [('main',m),('cap+',cp),('cap-',cm)]:clear(f'Coupling tool access {label} {x}, shift {delta}',tool,s)
for x,y in bolts:
    bolt=zcylinder(1.5,bottom-.1,Z+12,x,y)
    for label,s in printedparts:clear(f'Clamp bolt {x,y} vs {label}',bolt,s)
    tool=zcylinder(3,Z+10,Z+80,x,y)
    clear(f'Clamp screw driver access {x,y}',tool,main)
    washer=zcylinder(3.5,Z+9.5,Z+10,x,y).cut(zcylinder(1.6,Z+9.4,Z+10.1,x,y))
    clear(f'Clamp washer {x,y}',washer,main)
    nut=hex_socket(x,y,bottom+.05,2.4,5.5)
    clear(f'Nut fit {x,y}',nut,main)
for y in (-15.5,15.5):
    for z in (Z-15.5,Z+15.5):
        clear(f'Motor screw clearance {y,z}',cylinder(1.5,back-1,front+2,y,z),main)
        clear(f'Motor screw tool access {y,z}',cylinder(3,back-20,back-.1,y,z),main)
def read_step(name):
    s=Part.Shape();s.read(str(OUT/'baseline'/(name+'.step')));return s
saddle=read_step('cross_slide_saddle_r9');slide=read_step('cross_slide_top_plate_r9')
for delta in (min_shift,0,max_shift):
    for label,s in printedparts:
        clear(f'{label} vs saddle shift {delta}',move(s,dx=delta),saddle)
        for pos in (-g['X_TRAVEL']/2,0,g['X_TRAVEL']/2):
            clear(f'{label} vs slide {pos}, shift {delta}',move(s,dx=delta),move(slide,dx=pos))
head=read_step('headstock_frame');tail=read_step('tailstock_frame_belt');carrier=read_step('tailstock_carrier')
span=g['travel_math']()['clear_between_inboard_faces_mm']
head.rotate(V(),V(0,0,1),180);head.translate(V(0,-span,0));carrier.rotate(V(),V(0,0,1),180)
fixed=[('headstock',head),('tailstock',tail),('carrier',carrier)]
cap0=read_step('rail_clamp_cap_x4')
for sign in (-1,1):
    for yy in (0,-span):fixed.append((f'Z rail cap {sign,yy}',move(cap0,dx=sign*g['RAIL_X'],dy=yy,dz=g['ZA'])))
    fixed.append((f'Z rail {sign}',Part.makeCylinder(g['RAIL_D']/2,span+2*g['PLATE_T'],V(sign*g['RAIL_X'],-span-g['PLATE_T'],g['ZA']),V(0,1,0))))
fixed.append(('bench',box(-250,250,-300,200,-10,0)))
lo=-span+g['SADDLE_Y']/2+1;hi=-g['TSC_T']-g['SADDLE_Y']/2-1
for label,s in printedparts+[('motor',motor),('coupler',coupler)]:
    b=s.BoundBox
    sweep=box(b.XMin+min_shift,b.XMax+max_shift,b.YMin+lo,b.YMax+hi,b.ZMin,b.ZMax)
    for nm,f in fixed:clear(f'Full Z travel conservative {label} vs {nm}',sweep,f)
untrimmed=cylinder(RD/2,T,T+140,RY)
check('Long untrimmed rail must be shortened',untrimmed.common(motor).Volume>0,untrimmed.common(motor).Volume)
check('Screw and motor axes collinear',True,{'motor_y':0,'motor_z':Z,'screw_y':0,'screw_z':g['XA']})
check('Coupling screw engagement',screw_tip-couple_start>=10,screw_tip-couple_start)
check('Coupling motor engagement',couple_start+C['coupler_length_mm']-motor_tip>=10,couple_start+C['coupler_length_mm']-motor_tip)
scene=[]
def addscene(label,s,color):
    v,f=s.tessellate(.35)
    scene.append({'label':label,'color':color,'vertices':[[p.x,p.y,p.z] for p in v],'faces':f})
for label,s,col in [('main',main,'#dc9744'),('cap_positive',cap,'#edbe70'),('cap_negative',capminus,'#edbe70'),('motor',motor,'#303842'),('coupler',coupler,'#7486a2'),('screw',screw,'#bcc5cb'),('rail_positive',rails[1],'#9db0b9'),('rail_negative',rails[0],'#9db0b9'),('saddle',saddle,'#72848b'),('slide',slide,'#b1bec1')]:addscene(label,s,col)
(OUT/'preview_scene.json').write_text(json.dumps(scene))
meshstats={}
for name,s in [('inline_motor_mount',main),('rail_clamp_cap_PRINT_2',cap)]:
    s.exportStep(str(OUT/(name+'.step')))
    t=Part.Shape();t.read(str(OUT/(name+'.step')))
    check(name+' STEP volume preserved',abs(s.Volume-t.Volume)<.01,abs(s.Volume-t.Volume))
    for ld,ad in ((.03,.1),(.02,.07),(.01,.05)):
        mesh=MeshPart.meshFromShape(Shape=t,LinearDeflection=ld,AngularDeflection=ad,Relative=False)
        if mesh.isSolid() and not mesh.hasNonManifolds() and not mesh.hasSelfIntersections():break
    check(name+' mesh closed/manifold/no self intersections',mesh.isSolid() and not mesh.hasNonManifolds() and not mesh.hasSelfIntersections(),mesh.CountFacets)
    assert mesh.isSolid() and not mesh.hasNonManifolds() and not mesh.hasSelfIntersections()
    mesh.write(str(OUT/(name+'_assembly.stl')))
    pm=mesh.copy();rot=App.Matrix()
    if name=='inline_motor_mount':rot.A11=0;rot.A13=1;rot.A31=-1;rot.A33=0
    else:rot.A22=-1;rot.A33=-1
    pm.transform(rot);b=pm.BoundBox;translation=App.Matrix();translation.move(V(-b.XMin,-b.YMin,-b.ZMin));pm.transform(translation)
    pm.write(str(OUT/(name+'.stl')))
    check(name+' print mesh valid',pm.isSolid() and not pm.hasNonManifolds() and not pm.hasSelfIntersections())
    b=pm.BoundBox
    check(name+' fits 220 mm bed',b.XLength<220 and b.YLength<220 and b.ZLength<250,[b.XLength,b.YLength,b.ZLength])
    meshstats[name]={'volume_cm3':s.Volume/1000,'print_dimensions_mm':[b.XLength,b.YLength,b.ZLength],'facets':pm.CountFacets,'linear_deflection_mm':ld,'angular_deflection_rad':ad}
doc=App.newDocument('R9_Inline_Rail_Mount')
for name,s,col in [('MainBracket',main,(.86,.59,.27)),('ClampCapPositive',cap,(.93,.74,.44)),('ClampCapNegative',capminus,(.93,.74,.44))]:
    ob=doc.addObject('PartDesign::Feature',name);ob.Shape=s
for name,s in [('MotorReference',motor),('CouplerReference',coupler),('LeadscrewReference',screw),('RailPositiveReference',rails[1]),('RailNegativeReference',rails[0]),('SaddleReference',saddle),('SlideReference',slide)]:
    ob=doc.addObject('PartDesign::Feature',name);ob.Shape=s;ob.Label=name+' (NOT FOR PRINT)'
doc.recompute();doc.saveAs(str(OUT/'inline_mount_assembly.FCStd'))
Part.makeCompound([main,cap,capminus,motor,coupler,screw]+rails+[saddle,slide]).exportStep(str(OUT/'inline_mount_assembly.step'))
report={'status':'PASS' if all(k['passed'] for k in checks) else 'FAIL','checks':checks,'parameters':C,'rails_diameter_mm':RD,'rails_spacing_mm':2*RY,'axis_z_mm':Z,'tower_face_x_mm':T,'clamp_x_mm':[start,end],'adjustment_mm':[min_shift,max_shift],'adjustment_total_mm':max_shift-min_shift,'motor_front_x_mm':front,'screw_projection_nominal_mm':screw_tip-T,'screw_projection_range_mm':[screw_tip-T+min_shift,screw_tip-T+max_shift],'coupler_x_mm':[couple_start,couple_start+C['coupler_length_mm']],'shaft_engagement_mm':(C['coupler_length_mm']-C['shaft_end_gap_mm'])/2,'rounding':{'main':mainround,'cap':capround},'meshes':meshstats,'baseline_sha256':hashlib.sha256((OUT/'r9_source_snapshot.py').read_bytes()).hexdigest(),'limitations':['Actual motor shaft length/body depth and coupler dimensions require physical fit check.','25 mm coupler length assumed from Ender 3 Pro stock-style part; clearance envelope 20 mm OD, also checked at 24 mm OD.','Long rail must be trimmed to about 30 mm beyond tower before motor fits.','Direct drive torque and printed stiffness have not been physically tested.','Original bearings and collars must support screw axial thrust.','4 mm/revolution screw lead is user estimate.']}
(OUT/'verification.json').write_text(json.dumps(report,indent=2))
print(json.dumps({k:v for k,v in report.items() if k not in ('checks','parameters')},indent=2))
print('PASS',sum(k['passed'] for k in checks),'FAIL',sum(not k['passed'] for k in checks),flush=True)
assert report['status']=='PASS'

