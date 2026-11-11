"""One-piece R9 inline mount: full-length single-split rail collars + original side flange.
Functional locations use original R9 coordinates. Configuration includes inch
dimensions; all CAD geometry is computed internally in mm.
"""
import FreeCAD as App
import Part, MeshPart
from FreeCAD import Vector as V
from pathlib import Path
import json,math,hashlib
from fillet_edges import convex_edges,acceptable
OUT=Path(__file__).resolve().parent
C=json.loads((OUT/'parameters.json').read_text(encoding='utf-8-sig')); IN=25.4
src=(OUT/'r9_source_snapshot.py').read_text().replace('\nmain()\n','\n')
g={'__name__':'r9_baseline','__file__':str(OUT/'r9_source_snapshot.py'),'P_OVERRIDE':{'long_x':True}}
exec(compile(src,'r9_baseline','exec'),g);P=g['P']
T=g['XHALF'];Z=g['XA'];RY=g['XRAIL_Y'];RD=g['XRAIL_D'];SD=P['xscrew_dia_in']*IN
start=T+C['rail_seat_offset_mm'];end=T+C['clearance_from_tower_to_inner_motor_plate_in']*IN
back=T+C['clearance_from_tower_to_inner_motor_plate_in']*IN
front=back+C['motor_plate_thickness_in']*IN
motor_tip=front-C['motor_shaft_projection_mm']
centre=motor_tip-C['shaft_end_gap_mm']/2
screw_tip=centre-C['shaft_end_gap_mm']/2
couple_start=centre-C['coupler_length_mm']/2;couple_end=couple_start+C['coupler_length_mm']
bottom=Z-9.5;arm_top=Z+15.5;plate_bottom=Z-27.15;plate_top=Z+27.15
side_y=g['TOWER_Y']/2;side_outer=side_y+C['side_flange_thickness_in']*IN
side_x0=g['TOWER_IN'];side_x1=start+1
checks=[]
def check(n,ok,detail=None):
    checks.append({'name':n,'passed':bool(ok),'detail':detail})
    if not ok:print('FAILED',n,detail,flush=True)
def clear(n,a,b):
    v=a.common(b).Volume
    check(n,v<1e-5,{'intersection_mm3':v,'gap_mm':a.distToShape(b)[0]})
def box(x0,x1,y0,y1,z0,z1):return Part.makeBox(x1-x0,y1-y0,z1-z0,V(x0,y0,z0))
def cyl(r,x0,x1,y=0,z=Z):return Part.makeCylinder(r,x1-x0,V(x0,y,z),V(1,0,0))
def ycyl(r,y0,y1,x,z):return Part.makeCylinder(r,y1-y0,V(x,y0,z),V(0,1,0))
def move(s,dx=0,dy=0,dz=0):
    t=s.copy();t.translate(V(dx,dy,dz));return t
def triangle(y0,y1,points):
    p=[V(x,y0,z) for x,z in points]
    return Part.Face(Part.makePolygon(p+[p[0]])).extrude(V(0,y1-y0,0))
parts=[box(start,end,y-14.5,y+14.5,bottom,Z+9.5) for y in (-RY,RY)]
run=10
for ya,yb in ((25.5,33.5),(-33.5,-25.5)):
    parts.append(box(start,back,ya,yb,bottom,arm_top))
    parts.append(triangle(ya,yb,[(back,bottom),(back-run,bottom),(back,bottom-8)]))
    parts.append(triangle(ya,yb,[(back,arm_top),(back-run,arm_top),(back,arm_top+8)]))
parts.append(box(back,front,-33.5,33.5,plate_bottom,plate_top))
# Flange lies on the original +Y tower face. One-mm overlap into the rail seat
# makes the connecting web integral. Its four holes have no axial slots.
parts.append(box(side_x0,side_x1,side_y,side_outer,g['ZF0'],g['TOWER_Z1']))
parts.append(box(T,end,side_y,side_outer,bottom,Z)) # continuous flange-to-seat web
main=parts[0].multiFuse(parts[1:]).removeSplitter()
bore=(RD+C['rail_bore_clearance_mm'])/2
for y in (-RY,RY):main=main.cut(cyl(bore,start-1,end+.01,y))
# Coupling is now between the rail seats. A round central relief preserves
# each half seat while clearing the full coupling envelope and screw.
relief=cyl(C['coupler_relief_diameter_mm']/2,T-1,back+.1)
main=main.cut(relief)
main=main.cut(cyl(11.75,back-1,front+1))
for y in (-15.5,15.5):
    for z in (Z-15.5,Z+15.5):main=main.cut(cyl(1.7,back-1,front+1,y,z))
for x in g['R9_MOUNT_X']:
    for z in g['R9_MOUNT_Z']:main=main.cut(ycyl(C['side_hole_clearance_mm']/2,side_y-1,side_outer+1,x,z))

# Horizontal radial split: outer jaws can pinch while inner half stays integral.
# The motor plate remains the rear structural bridge.
slot_width=C['clamp_slit_mm']
for y in (-RY,RY):
    ya,yb=(y,side_outer+1) if y>0 else (-34.5,y)
    main=main.cut(box(start-.01,back+.001,ya,yb,Z-slot_width/2,Z+slot_width/2))
pinch=[]
def zcyl(r,z0,z1,x,y):
    return Part.makeCylinder(r,z1-z0,V(x,y,z0),V(0,0,1))
def hexprism(x,y,z0,z1,af):
    r=af/math.sqrt(3)
    points=[V(x+r*math.cos(i*math.pi/3),y+r*math.sin(i*math.pi/3),z0) for i in range(6)]
    return Part.Face(Part.makePolygon(points+[points[0]])).extrude(V(0,0,z1-z0))
for y in (-29,29):
    for x in (start+7,back-9):
        main=main.cut(zcyl(1.7,bottom-1,arm_top+1,x,y))
        main=main.cut(zcyl(3.1,Z+9,arm_top+40,x,y))
        main=main.cut(hexprism(x,y,bottom-.01,bottom+2.5,5.7))
        pinch.append((x,y))

main=main.removeSplitter();sharp=main.copy()
# 2 mm plate corners; light rounds elsewhere without enlarging rail seats.
big=[]
for e in convex_edges(main,3):
    b=e.BoundBox
    if type(e.Curve).__name__=='Line' and b.XLength>1 and b.YLength<1e-6 and b.ZLength<1e-6:
        if abs(abs(b.YMin)-33.5)<1e-6 and min(abs(b.ZMin-plate_bottom),abs(b.ZMin-plate_top))<1e-6:big.append(e)
main=main.makeFillet(2,big).removeSplitter()
stats={'corner_radius_mm':2,'large_corner_edges':len(big),'edge_radius_mm':.6,'edge_groups':[]}
def eligible(e):
    if type(e.Curve).__name__!='Line' or e.Length<2:return False
    b=e.BoundBox;p=e.valueAt((e.FirstParameter+e.LastParameter)/2)
    if abs(p.y-side_y)<.01:return False
    if any(abs(p.x-x)<3.5 and abs(p.y-y)<3.5 for x,y in pinch):return False
    if abs(p.z-Z)<slot_width/2+.1:return False # exact tower mating face
    if p.x<end+.01 and min(abs(p.y-RY),abs(p.y+RY))<bore+.1 and p.z>Z-6:return False
    if p.x<end+.01 and abs(p.y)<12.1:return False # coupling relief
    if abs(p.z-Z)<.01 and start-.01<=p.x<=end+.01:return False # half-seat mouths
    return True
sig=[(e.valueAt((e.FirstParameter+e.LastParameter)/2),type(e.Curve).__name__) for e in convex_edges(main) if eligible(e)]
def match(p,k):
    for e in main.Edges:
        try:current_kind=type(e.Curve).__name__
        except TypeError:continue
        if current_kind!=k:continue
        b=e.BoundBox
        if b.XMin-1e-6<=p.x<=b.XMax+1e-6 and b.YMin-1e-6<=p.y<=b.YMax+1e-6 and b.ZMin-1e-6<=p.z<=b.ZMax+1e-6 and Part.Vertex(p).distToShape(e)[0]<1e-6:return e
def apply(group):
    global main
    live=[e for e in (match(p,k) for p,k in group) if e is not None]
    if not live:return
    try:
        s=main.makeFillet(.6,live).removeSplitter()
        if not s.isValid() or len(s.Solids)!=1 or s.Volume>main.Volume+.01 or s.cut(main).Volume>1e-5 or not acceptable(s):raise ValueError('invalid')
        main=s;stats['edge_groups'].append(len(live))
    except Exception:
        if len(group)>1:
            n=len(group)//2;apply(group[:n]);apply(group[n:])
apply(sig)
print('Rounding',stats,flush=True)
check('Rounded bracket valid single solid',main.isValid() and len(main.Solids)==1)
check('Rounds only remove material',main.cut(sharp).Volume<1e-5,main.cut(sharp).Volume)
motor=box(front,front+C['motor_body_depth_in']*IN,-21.15,21.15,Z-21.15,Z+21.15)
boss=cyl(11,front-2,front);shaft=cyl(2.5,motor_tip,front)
screw=cyl(SD/2,T,screw_tip)
coupler=cyl(C['coupler_diameter_envelope_mm']/2,couple_start,couple_end)
coupler=coupler.cut(cyl(SD/2,couple_start-1,centre)).cut(cyl(2.5,centre,couple_end+1))
rails=[cyl(RD/2,T,T+C['rail_projection_mm'],y) for y in (-RY,RY)]
check('Exact 1.25 inch tower-to-inner-plate clearance',abs((back-T)/IN-1.25)<1e-9,(back-T)/IN)
check('Integral single-split collars reach plate',abs(end-back)<1e-9,{'printed_part_count':1,'split_width_in':slot_width/IN,'pinch_bolt_count':len(pinch)})
check('Rail engagement and tip clearance',start>T and end>T+C['rail_projection_mm'],{'engagement_in':(T+C['rail_projection_mm']-start)/IN,'tip_to_plate_in':(back-T-C['rail_projection_mm'])/IN})
check('Coupler remains outside tower',couple_start>T+.5,{'tower_gap_in':(couple_start-T)/IN})
check('Coupling shaft engagement',screw_tip-couple_start>=10 and couple_end-motor_tip>=10,{'screw_in':(screw_tip-couple_start)/IN,'motor_in':(couple_end-motor_tip)/IN})
check('Shaft ends separated',motor_tip-screw_tip>=C['shaft_end_gap_mm']-1e-6,(motor_tip-screw_tip)/IN)
clear('Bracket vs motor body',main,motor);clear('Bracket vs motor pilot',main,boss)
clear('Bracket vs motor shaft',main,shaft);clear('Bracket vs screw',main,screw)
clear('Bracket vs coupling',main,coupler)
check('Coupling minimum 2 mm bracket clearance',main.distToShape(coupler)[0]>=1.999,main.distToShape(coupler)[0]/IN)
for i,r in enumerate(rails):
    clear(f'Bracket vs rail {i}',main,r);clear(f'Motor vs rail {i}',motor,r);clear(f'Coupler vs rail {i}',coupler,r)
    clear(f'Pilot boss vs rail {i}',boss,r)
# Cross-sectional seat material directly below each rail bottom remains intact.
for y in (-RY,RY):
    strip=box(start+1,end-1,y-1,y+1,bottom+1,Z-RD/2-.1)
    check(f'Continuous lower bearing seat material {y}',strip.common(main).Volume>.99*strip.Volume,strip.common(main).Volume/strip.Volume)
web_core=box(T+1,end-1,side_y+1,side_outer-1,bottom+1,Z-1)
for x,y in pinch:
    web_core=web_core.cut(zcyl(3.5,bottom-1,arm_top+1,x,y))
check('Continuous side flange-to-seat web material',web_core.common(main).Volume>.99*web_core.Volume,web_core.common(main).Volume/web_core.Volume)

for x,y in pinch:
    clear(f'Pinch screw shank {x,y}',main,zcyl(1.5,bottom-.5,Z+9,x,y))
    clear(f'Pinch screw head {x,y}',main,zcyl(2.8,Z+9,Z+12,x,y))
    clear(f'Pinch driver access {x,y}',main,zcyl(2.7,Z+9,arm_top+35,x,y))
    clear(f'Captive M3 nut {x,y}',main,hexprism(x,y,bottom,bottom+2.4,5.5))
    for zz in (Z+1,bottom+3):
        ring=zcyl(3.0,zz,zz+1,x,y).cut(zcyl(1.75,zz-.1,zz+1.1,x,y))
        check(f'Pinch bolt bearing material {x,y,zz}',ring.common(main).Volume>.97*ring.Volume,ring.common(main).Volume/ring.Volume)
for y in (-RY,RY):
    ya,yb=(y+6,33) if y>0 else (-33,y-6)
    slit=box(start+.1,back-.1,ya,yb,Z-slot_width/2+.01,Z+slot_width/2-.01)
    clear(f'Continuous radial clamp slit {y}',main,slit)
# Tool access from above for both coupling setscrews, plus the new side screws.
for x in (couple_start+C['coupler_length_mm']*.25,couple_start+C['coupler_length_mm']*.75):
    tool=Part.makeCylinder(3,65,V(x,0,Z+7),V(0,0,1))
    clear(f'Coupling top driver access {x}',main,tool)
for y in (-15.5,15.5):
    for z in (Z-15.5,Z+15.5):
        clear(f'Motor bolt {y,z}',main,cyl(1.5,back-1,front+2,y,z))
        clear(f'Motor bolt driver access {y,z}',main,cyl(3,back-18,back-.1,y,z))
        ring=cyl(3,back,front,y,z).cut(cyl(1.75,back-.1,front+.1,y,z))
        check(f'Motor bolt supporting material {y,z}',ring.common(main).Volume>.98*ring.Volume,ring.common(main).Volume/ring.Volume)
def read_step(n):
    s=Part.Shape();s.read(str(OUT/'baseline'/(n+'.step')));return s
saddle=read_step('cross_slide_saddle_r9');slide=read_step('cross_slide_top_plate_r9')
clear('Bracket vs R9 saddle',main,saddle)
for pos in (-g['X_TRAVEL']/2,0,g['X_TRAVEL']/2):
    moved=move(slide,dx=pos);clear(f'Bracket vs slide {pos}',main,moved)
    clear(f'Motor vs slide {pos}',motor,moved)
# Measurable contact area and four exact side axes retained.
area=main.common(move(saddle,dy=.05)).Volume/.05
check('Side flange seats against original tower',area>350,{'contact_area_square_in':area/IN**2})
for x in g['R9_MOUNT_X']:
    for z in g['R9_MOUNT_Z']:
        axis=ycyl(.8,side_y-P['mp_tap_depth']+.5,side_outer+1,x,z)
        clear(f'Original M4 side axis vs bracket {x,z}',main,axis)
        clear(f'M4 full shank clearance in flange {x,z}',main,ycyl(2,side_y-.1,side_outer+.1,x,z))
        clear(f'Original M4 side axis vs saddle {x,z}',saddle,axis)
        head=ycyl(3.5,side_outer,side_outer+4,x,z)
        clear(f'Side screw head access {x,z}',main,head)
        tool=ycyl(3,side_outer+.1,side_outer+40,x,z)
        clear(f'Side screw driver access {x,z}',main,tool)
        ring=ycyl(4,side_y+.1,side_outer-.1,x,z).cut(ycyl(2.3,side_y,side_outer,x,z))
        check(f'Side hole supporting wall {x,z}',ring.common(main).Volume>.99*ring.Volume,ring.common(main).Volume/ring.Volume)
        throat=ycyl(3.5,side_y-.1,side_y-.05,x,z)
        check(f'Side hole backed by saddle {x,z}',throat.common(saddle).Volume>0,throat.common(saddle).Volume)
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
for label,s in [('bracket',main),('motor',motor),('coupling',coupler)]:
    b=s.BoundBox;sweep=box(b.XMin,b.XMax,b.YMin+lo,b.YMax+hi,b.ZMin,b.ZMax)
    for nm,f in fixed:clear(f'Conservative continuous Z sweep {label} vs {nm}',sweep,f)
for nm,f in fixed:
    for x in g['R9_MOUNT_X']:
        for z in g['R9_MOUNT_Z']:
            h=ycyl(3.5,side_outer,side_outer+4,x,z);b=h.BoundBox
            swept=box(b.XMin,b.XMax,b.YMin+lo,b.YMax+hi,b.ZMin,b.ZMax)
            clear(f'Side screw head Z sweep {x,z} vs {nm}',swept,f)
check('Long 140 mm rail needs shortening',cyl(RD/2,T,T+140,RY).common(motor).Volume>0)
# Preserve the verified tessellation under a rigid print orientation.
name='inline_motor_mount_EXTENDED_SPLIT_CLAMPS'
main.exportStep(str(OUT/(name+'.step')))
loaded=Part.Shape();loaded.read(str(OUT/(name+'.step')))
check('STEP volume preserved',abs(main.Volume-loaded.Volume)<.01,abs(main.Volume-loaded.Volume))
for ld,ad in ((.03,.1),(.02,.07),(.01,.05)):
    mesh=MeshPart.meshFromShape(Shape=loaded,LinearDeflection=ld,AngularDeflection=ad,Relative=False)
    if mesh.isSolid() and not mesh.hasNonManifolds() and not mesh.hasSelfIntersections():break
check('Assembly mesh closed and manifold without self intersections',mesh.isSolid() and not mesh.hasNonManifolds() and not mesh.hasSelfIntersections(),mesh.CountFacets)
assert mesh.isSolid() and not mesh.hasNonManifolds() and not mesh.hasSelfIntersections()
mesh.write(str(OUT/(name+'_assembly.stl')))
pm=mesh.copy();rot=App.Matrix();rot.A11=0;rot.A13=1;rot.A31=-1;rot.A33=0;pm.transform(rot)
b=pm.BoundBox;tr=App.Matrix();tr.move(V(-b.XMin,-b.YMin,-b.ZMin));pm.transform(tr)
pm.write(str(OUT/(name+'_PRINT.stl')))
check('Print mesh valid',pm.isSolid() and not pm.hasNonManifolds() and not pm.hasSelfIntersections())
b=pm.BoundBox;check('Fits existing Ender 220 mm bed',b.XLength<220 and b.YLength<220 and b.ZLength<250,[b.XLength/IN,b.YLength/IN,b.ZLength/IN])
doc=App.newDocument('R9_Extended_Split_Inline_Mount')
ob=doc.addObject('PartDesign::Feature','MainBracket');ob.Label='Full-length split collars, four side holes, 1.25 inch clearance';ob.Shape=main
doc.recompute();doc.saveAs(str(OUT/(name+'.FCStd')))
reference=App.newDocument('R9_Inline_Side_Tie_Assembly')
scene=[]
for label,s,col in [('main',main,'#dc9744'),('motor',motor,'#303842'),('coupler',coupler,'#7486a2'),('shaft',shaft,'#b4c2c8'),('screw',screw,'#bcc5cb'),('rail_positive',rails[1],'#9db0b9'),('rail_negative',rails[0],'#9db0b9'),('saddle',saddle,'#72848b'),('slide',slide,'#b1bec1')]:
    obj=reference.addObject('PartDesign::Feature',label);obj.Shape=s;obj.Label=label+(' (REFERENCE ONLY)' if label!='main' else '')
    v,f=s.tessellate(.35);scene.append({'label':label,'color':col,'vertices':[[p.x,p.y,p.z] for p in v],'faces':f})
reference.recompute();reference.saveAs(str(OUT/'inline_side_tie_assembly.FCStd'))
Part.makeCompound([main,motor,coupler,shaft,screw]+rails+[saddle,slide]).exportStep(str(OUT/'inline_side_tie_assembly.step'))
(OUT/'preview_scene.json').write_text(json.dumps(scene))
report={'status':'PASS' if all(k['passed'] for k in checks) else 'FAIL','checks':checks,'parameters':C,'clearance_from_tower_to_inner_plate_in':(back-T)/IN,'rail_seats_x_mm':[start,end],'clamp_x_mm':[start,end],'tower_face_x_mm':T,'motor_inner_plate_x_mm':back,'motor_front_x_mm':front,'motor_body_depth_in':C['motor_body_depth_in'],'coupler_x_mm':[couple_start,couple_end],'screw_projection_nominal_mm':screw_tip-T,'screw_projection_in':(screw_tip-T)/IN,'rail_spacing_in':2*RY/IN,'rail_diameter_in':RD/IN,'rail_projection_in':C['rail_projection_mm']/IN,'side_hole_centres_mm':[[x,side_y,z] for x in g['R9_MOUNT_X'] for z in g['R9_MOUNT_Z']],'side_flange_y_mm':[side_y,side_outer],'axis_z_mm':Z,'side_flange_contact_area_in2':area/IN**2,'physical_axial_adjustment':False,'coupling_gap_to_tower_in':(couple_start-T)/IN,'coupling_to_bracket_gap_in':main.distToShape(coupler)[0]/IN,'shaft_engagement_in':(C['coupler_length_mm']-C['shaft_end_gap_mm'])/2/IN,'pinch_bolt_centres_mm':pinch,'gusset_count':4,'rounding':stats,'print_bounds_in':[b.XLength/IN,b.YLength/IN,b.ZLength/IN],'volume_in3':main.Volume/IN**3,'mesh_facets':mesh.CountFacets,'mesh_deflection_mm':ld,'source_sha256':hashlib.sha256((OUT/'r9_source_snapshot.py').read_bytes()).hexdigest(),'limitations':['Actual motor shaft projection remains unmeasured; assumes 24 mm (0.945 inch).','Actual coupler length remains inferred; assumes 25 mm (0.984 inch), clearance envelope 20 mm OD (0.787 inch).','Rails must be trimmed to about 30 mm (1.181 inch) beyond tower before fitting.','Four original side holes retain bracket; four M3 pinch screws clamp the extended integral collars. Printed clamp compliance has not been physically tested.','No physical fit, load, thermal or durability test.','Original fixed-end screw bearings and collars retain axial thrust.']}
(OUT/'verification.json').write_text(json.dumps(report,indent=2))
print(json.dumps({k:v for k,v in report.items() if k not in ('checks','parameters')},indent=2))
print('PASS',sum(k['passed'] for k in checks),'FAIL',sum(not k['passed'] for k in checks),flush=True)
assert report['status']=='PASS'



