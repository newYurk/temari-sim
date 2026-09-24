import re,html,sys
def h2t(path):
    s=open(path,encoding='utf-8',errors='ignore').read()
    t=re.sub(r'<script.*?</script>|<style.*?</style>|<!--.*?-->','',s,flags=re.S|re.I)
    t=re.sub(r'<(br|p|div|li|h\d|tr)[^>]*>','\n',t,flags=re.I)
    t=html.unescape(re.sub(r'<[^>]+>',' ',t)); t=re.sub(r'[ \t\u3000]+',' ',t); t=re.sub(r'\n\s*\n+','\n',t)
    return t
if __name__=='__main__':
    for p in sys.argv[1:]:
        print('=====',p); print(h2t(p))
