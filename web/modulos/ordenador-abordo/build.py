import re,sys,os
d=os.path.dirname(os.path.abspath(__file__))
m=open(os.path.join(d,'ordenador-abordo.js'),encoding='utf-8').read()
m=re.sub(r'^export (function|const) ',r'\1 ',m,flags=re.M); m=re.sub(r'^export default .*$','',m,flags=re.M)
da=open(os.path.join(d,'datos-malkevnia.js'),encoding='utf-8').read()
da=re.sub(r'^export const ','const ',da,flags=re.M); da=re.sub(r'^export default .*$','',da,flags=re.M)
h=open(os.path.join(d,'demo.html'),encoding='utf-8').read().replace('//__MODULE__',m).replace('//__DATA__',da)
open(sys.argv[1] if len(sys.argv)>1 else os.path.join(d,'ordenador-de-a-bordo.html'),'w',encoding='utf-8').write(h)
