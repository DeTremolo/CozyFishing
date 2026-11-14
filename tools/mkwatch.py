# Kellotaulun pikselikuvan (img/watch.png) generaattori. Aja repon juuresta: python3 tools/mkwatch.py
import math, os
from PIL import Image
N=49; C=24.5
im=Image.new('RGBA',(N,N),(0,0,0,0)); p=im.load()
def hx(s): s=s.lstrip('#'); return tuple(int(s[i:i+2],16) for i in (0,2,4))+(255,)
OUT=hx('#0a0a0a'); cream=hx('#f2d39a'); dim=hx('#c8ac78')
# Lyhyet kiinnikkeet ylä- ja alareunassa
for x in []:
    p[x,0]=OUT; p[x,48]=OUT
def h(x,y): v=math.sin(x*12.9898+y*78.233)*43758.5453; return v-math.floor(v)
for y in range(N):
    for x in range(N):
        dx=x+0.5-C; dy=y+0.5-C; r=math.hypot(dx,dy)
        if r>23.6: continue
        light=(-dx-dy)/max(r,0.01)
        if r>22.7: col=OUT
        elif r>20.4:
            t=light*0.5+0.5+(h(x,y)-0.5)*0.2
            col=hx('#f4f4f4') if t>0.85 else hx('#d0d0d0') if t>0.6 else hx('#a8a8a8') if t>0.35 else hx('#808080') if t>0.15 else hx('#606060')
            if r>22.2: col=hx('#9a9a9a') if light>0 else hx('#5a5a5a')
        elif r>19.8: col=hx('#2c2c2c')
        else: col=hx('#111111')
        p[x,y]=col
def put(x,y,c):
    if 0<=x<N and 0<=y<N: p[x,y]=c
# Minuuttimerkit
for i in range(60):
    a=i/60*2*math.pi; sx,sy=math.sin(a),-math.cos(a)
    if i%15==0: continue
    if i%5==0:
        for rr in (18.0,19.0): put(int(C+sx*rr),int(C+sy*rr),cream)
    elif i%2==0: put(int(C+sx*18.8),int(C+sy*18.8),dim)
# Pitkät merkit kohdissa 12, 3, 6, 9
for rr in (17.0,18.0,19.0):
    for (sx,sy) in ((0,-1),(1,0),(0,1),(-1,0)):
        put(int(C+sx*rr),int(C+sy*rr),cream)
        if sx==0: put(int(C+sx*rr)-1,int(C+sy*rr),cream)
        else: put(int(C+sx*rr),int(C+sy*rr)-1,cream)
F={'0':['111','101','101','101','111'],'1':['01','11','01','01','01'],'2':['111','001','111','100','111'],
'3':['111','001','011','001','111'],'4':['101','101','111','001','001'],'5':['111','100','111','001','111'],
'6':['111','100','111','101','111'],'7':['111','001','010','010','010'],'8':['111','101','111','101','111'],'9':['111','101','111','001','111']}
def text(s,cx,cy):
    w=sum(len(F[c][0]) for c in s)+len(s)-1
    x0=round(cx-w/2); y0=round(cy-2.5)
    for c in s:
        g=F[c]
        for j,row in enumerate(g):
            for i,ch in enumerate(row):
                if ch=='1': put(x0+i,y0+j,cream)
        x0+=len(g[0])+1
for n in range(1,12):
    a=n/12*2*math.pi; rr=13.4 if n not in (3,9) else 14.2
    text(str(n),C+math.sin(a)*rr,C-math.cos(a)*rr)
# Kolmio kello 12:n kohdalla
ty=int(C-15.2)
for j in range(4):
    for i in range(-j,j+1): put(24+i,ty+j,cream)
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
im.save(os.path.join(ROOT,'img','watch.png'))
im.resize((N*8,N*8),Image.NEAREST).save(os.path.join(ROOT,'shots','watch_big.png')) if os.path.isdir(os.path.join(ROOT,'shots')) else None
