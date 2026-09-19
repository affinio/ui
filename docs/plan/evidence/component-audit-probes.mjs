// Diagnostic observations, not regression assertions. Run from any directory.
// --perf adds synthetic timings; --cycle must run under an external timeout.
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '')
const { createServer } = await import(`${root}/node_modules/vite/dist/node/index.js`)
import { performance } from 'node:perf_hooks'
const names = ['treeview-core', 'treeview-vue', 'dialog-core', 'dialog-vue', 'diagram-core', 'diagram-vue', 'overlay-kernel', 'surface-core']
const server = await createServer({ root, configFile: false, server: { middlewareMode: true, watch: null, hmr: false }, resolve: { alias: Object.fromEntries(names.map(name => [`@affino/${name}`, `${root}/packages/${name}/src/index.ts`])) } })
const load = name => server.ssrLoadModule(`/packages/${name}/src/index.ts`)
try {
  const { TreeviewCore } = await load('treeview-core')
  if (process.argv.includes('--cycle')) {
    const cyclic = new TreeviewCore({nodes:['a','b','c'].map(value=>({value,parent:null}))})
    console.log('cycle-probe: entering registerNodes')
    cyclic.registerNodes([{value:'a',parent:'b'},{value:'b',parent:'c'},{value:'c',parent:'b'}],{mode:'patch'})
    console.log('cycle-probe: returned')
  }
  const { useVirtualTreeviewController } = await load('treeview-vue')
  const { DialogController } = await load('dialog-core')
  const { createOverlayManager } = await load('overlay-kernel')
  const { createDiagramEngine, createDiagramInteractionController } = await load('diagram-core')
  const result = { node: process.version, platform: `${process.platform}/${process.arch}` }
  const tree = new TreeviewCore({nodes:[{value:'a', parent:null}]})
  let notifications = 0
  tree.subscribe(() => notifications++)
  notifications = 0
  tree.registerNodes([{value:'b', parent:null}], {mode:'patch'})
  result.treeStructuralNotification = { notifications, visible: tree.getVisibleValues() }
  const searched = new TreeviewCore({nodes:[{value:'a',parent:null,text:'parent'},{value:'b',parent:'a',text:'needle'}]})
  searched.setSearchQuery('needle')
  searched.requestToggle('a')
  result.treeSearchCollapse = { before: searched.getNodeMeta('a').expanded, toggle: searched.requestToggle('a'), after: searched.getNodeMeta('a').expanded }
  const searchOnly = new TreeviewCore({nodes:[{value:'a',parent:null,text:'parent'},{value:'b',parent:'a',text:'needle'}]})
  searchOnly.setSearchQuery('needle')
  searchOnly.requestFocusNext()
  let searchNotifications=0
  searchOnly.subscribe(()=>searchNotifications++)
  searchNotifications=0
  searchOnly.requestCollapse('a')
  result.treeSearchOnlyCollapse={notifications:searchNotifications,active:searchOnly.getSnapshot().active,visible:searchOnly.getVisibleValues()}
  const virtual = useVirtualTreeviewController({nodes:Array.from({length:20}, (_,i)=>({value:String(i),parent:null})),rowHeight:32,viewportHeight:320,overscan:0})
  virtual.setScrollTop(1)
  virtual.refreshWindow()
  result.virtualCoverage = { expectedBottom:321, actualBottom:virtual.visibleRows.value.at(-1).top + 32, rows:virtual.visibleRows.value.length }
  virtual.core.registerNodes([{value:'extra',parent:null}],{mode:'patch'})
  result.virtualDirectCoreMutation = {coreCount:virtual.getVisibleCount(),height:virtual.totalHeight.value}
  virtual.dispose()
  let resolveGuard
  let closeContext
  const dialog = new DialogController({id:'audit-dialog',overlayManager:createOverlayManager()})
  dialog.open()
  dialog.setCloseGuard(context => {closeContext = context; return new Promise(resolve => {resolveGuard = resolve})})
  const pending = dialog.close('escape-key',{metadata:{audit:true}})
  await Promise.resolve()
  const early = await Promise.race([pending, new Promise(resolve=>setTimeout(()=>resolve('pending'),5))])
  resolveGuard({outcome:'allow'})
  await new Promise(resolve=>setTimeout(resolve,0))
  result.dialogKernelGuard = {earlyResult:early,context:closeContext,phase:dialog.snapshot.phase}
  dialog.destroy()
  let release
  let afterClose = 0
  const destroyed = new DialogController({lifecycle:{afterClose:()=>afterClose++}})
  destroyed.open()
  destroyed.setCloseGuard(()=>new Promise(resolve=>{release=resolve}))
  const destroyedClose=destroyed.close()
  await Promise.resolve()
  destroyed.destroy()
  release({outcome:'allow'})
  result.dialogDestroyedGuard={outcome:await destroyedClose,afterClose,phase:destroyed.snapshot.phase}
  let activated=0
  const defaultOpen=new DialogController({defaultOpen:true,focusOrchestrator:{activate:()=>activated++,deactivate:()=>{}}})
  result.dialogDefaultOpen={activated}
  defaultOpen.destroy()
  const node = (id,x=0)=>({id,kind:'node',x,y:0,width:20,height:20})
  const diagram=createDiagramEngine({nodes:[node('a')]})
  result.diagramClear={command:diagram.transact(()=>({nodes:[]})),snapshotSize:diagram.getScene().entities.nodesById.size,query:diagram.queryVisible({x:0,y:0,width:100,height:100})}
  const historyEngine=createDiagramEngine({nodes:[node('a')]})
  let historyDuringPublish
  historyEngine.subscribe((_scene,change)=>{if(change.revision)historyDuringPublish=historyEngine.canUndo()})
  historyEngine.dispatch({type:'moveNode',id:'a',delta:{x:1,y:0}})
  result.diagramHistoryPublication={during:historyDuringPublish,after:historyEngine.canUndo()}
  const lockEngine=createDiagramEngine({texts:[{id:'t',kind:'text',x:0,y:0,width:20,height:20,text:'before',metadata:{locked:true}}]})
  result.diagramLock={canEdit:lockEngine.canEditText('t'),edit:lockEngine.dispatch({type:'editText',id:'t',text:'after'}),text:lockEngine.getScene().entities.textsById.get('t').text}
  const gestureEngine=createDiagramEngine({nodes:[node('a')],selection:{ids:['a'],primaryId:'a'}})
  const interaction=createDiagramInteractionController(gestureEngine)
  for(let i=0;i<2;i++){interaction.pointerDown({id:1,point:{x:5+i*10,y:5}});interaction.pointerUp({id:1,point:{x:15+i*10,y:5}})}
  result.diagramGestureHistory={x:gestureEngine.getScene().entities.nodesById.get('a').x,depth:gestureEngine.getDiagnostics().undoDepth}
  gestureEngine.dispatch({type:'undo'})
  result.diagramGestureHistory.afterUndo=gestureEngine.getScene().entities.nodesById.get('a').x
  interaction.pointerDown({id:1,point:{x:5,y:5}})
  interaction.cancel()
  result.diagramCancelTool=interaction.getSnapshot().tool
  const inputNode=node('owned')
  const owned=createDiagramEngine({nodes:[inputNode]})
  inputNode.x=500
  owned.dispatch({type:'setViewport',viewport:{x:1}})
  result.diagramInputOwnership={snapshotX:owned.getScene().entities.nodesById.get('owned').x,geometryX:owned.getGeometrySnapshot('owned').bounds.x}
  result.diagramZeroLimit=owned.queryEntities({limit:0})
  if(process.argv.includes('--dom')){
    const { JSDOM }=await import(`${root}/packages/dialog-vue/node_modules/jsdom/lib/api.js`)
    const dom=new JSDOM('<button id="trigger">Trigger</button><button id="panel">Panel</button>')
    const previous=Object.fromEntries(['window','document','HTMLElement'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]))
    for(const key of Object.keys(previous)) Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true,writable:true})
    try{
      const {createDialogFocusOrchestrator}=await load('dialog-vue')
      const trigger=document.getElementById('trigger')
      const panel=document.getElementById('panel')
      let target=null
      trigger.focus()
      const focus=createDialogFocusOrchestrator({dialog:()=>target})
      focus.activate({reason:'programmatic'})
      focus.deactivate({reason:'programmatic'})
      target=panel
      await Promise.resolve()
      result.dialogFocusAfterDeactivate=document.activeElement.id
    }finally{
      dom.window.close()
      for(const [key,descriptor] of Object.entries(previous)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}
    }
  }
  result.timings=[]
  const measure=fn=>{for(let i=0;i<3;i++)fn();const xs=[];for(let i=0;i<15;i++){const start=performance.now();fn();xs.push(performance.now()-start)}xs.sort((a,b)=>a-b);return {p50:xs[7],p95:xs[14]}}
  for(const count of process.argv.includes('--perf') ? [1000,5000,10000] : []){
    const engine=createDiagramEngine({nodes:Array.from({length:count},(_,i)=>node(String(i),i*40))})
    let x=0
    const viewport=measure(()=>engine.dispatch({type:'setViewport',viewport:{x:++x}}))
    const oneMove=measure(()=>engine.dispatch({type:'moveNode',id:'0',delta:{x:1,y:0}}))
    const query=measure(()=>engine.queryVisible({x:0,y:0,width:100,height:100}))
    const chain=new TreeviewCore({nodes:Array.from({length:count},(_,i)=>({value:i,parent:i?i-1:null,text:'match'}))})
    let flip=false
    const search=measure(()=>{flip=!flip;chain.setSearchQuery(flip?'match':'mat')})
    result.timings.push({count,diagramViewport:viewport,diagramOneMove:oneMove,diagramTinyQuery:query,treeDeepSearch:search})
  }
  console.log(JSON.stringify(result,null,2))
} finally { await server.close() }
