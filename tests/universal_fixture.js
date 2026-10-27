/* Isolated host simulation. All chat, settings and API data are synthetic. */
(() => {
 const memory=new Map(),callbacks=new Map(),chats=new Map();
 Object.defineProperty(window,'localStorage',{configurable:true,get:()=>({getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)})});
 window.__memory=memory;window.__requests=[];window.__persistCount=0;window.__metadataSaves=0;window.__mainCalls=0;window.__mockDelay=15;window.__finishReason='stop';window.__readyCount=0;
 window.__mockResponse='<status>{"mode":"full","state":{"角色":{"心情":"平静","好感度":60,"HP":"75/100","衣着":["外套","鞋"]},"场景":{"地点":"客厅"}}}</status>';
 const keys=['CHAT_CHANGED','GENERATION_STARTED','GENERATION_AFTER_COMMANDS','GENERATION_ENDED','GENERATION_STOPPED','MESSAGE_RECEIVED','CHARACTER_MESSAGE_RENDERED','MESSAGE_SWIPED','MESSAGE_DELETED','MESSAGE_EDITED','MESSAGE_UPDATED'];
 const eventTypes=Object.fromEntries(keys.map(key=>[key,key.toLowerCase()]));
 const ctx={characterId:0,characters:[{name:'通用演示',avatar:'chat-a.png',data:{description:'用于隔离测试的虚构角色。'}}],name1:'玩家',name2:'通用演示',groupId:null,chat:[{name:'通用演示',is_user:false,is_system:false,mes:'人物在客厅看书。',swipe_id:0}],chatMetadata:{other_extension:{keep:true}},
  getCurrentChatId:()=>window.__chatId||'chat-a',eventTypes,eventSource:{on:(type,fn)=>{if(!callbacks.has(type))callbacks.set(type,[]);callbacks.get(type).push(fn)},removeListener:(type,fn)=>callbacks.set(type,(callbacks.get(type)||[]).filter(f=>f!==fn))},
  setExtensionPrompt:(id,content,position,depth,scan,role)=>{window.__storyPrompt=content;window.__storyPlacement={id,position,depth,scan,role}},
  extensionSettings:{libei_status_v2:{enabled:true,legacyMigrationResolved:true,ui:{theme:'day',navPosition:'auto',navTapClose:true,showTopBar:true,showQuickReply:true,showFloorPanel:true,showOrb:true,orbImage:'',orbShape:'bookmark',orbOpacity:62,orbSize:48},channels:[],assignments:{summary:'',resummary:''},presets:[],generation:{mode:'inline',automatic:true,contextMessages:3,depth:0},exclusions:{excludedChars:[]}},other_extension:{keep:true}},
  getRequestHeaders:()=>({'Content-Type':'application/json','X-CSRF-Token':'preview-only'}),
  saveSettingsDebounced:()=>{window.__persistCount++},saveMetadata:async()=>{if(window.__saveFailure)throw Error('模拟保存失败');window.__metadataSaves++},
  messageFormatting:(text)=>String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>'),
  generateRaw:async params=>{window.__mainCalls++;window.__requests.push({kind:'main',params:JSON.parse(JSON.stringify(params))});await window.__emit('GENERATION_STARTED','quiet',{},false);await new Promise(resolve=>setTimeout(resolve,window.__mockDelay));const response=window.__mockResponse;await window.__emit('GENERATION_ENDED');return response},
 };
 window.__previewContext=ctx;window.SillyTavern={getContext:()=>ctx};window.__LIBEI_PREVIEW__=true;
 window.__emit=async(type,...args)=>{for(const fn of [...(callbacks.get(eventTypes[type])||[])])await fn(...args)};
 window.__listenerCounts=()=>Object.fromEntries([...callbacks].map(([name,list])=>[name,list.length]));
 window.__renderChat=()=>{const box=document.getElementById('chat');box.replaceChildren();ctx.chat.forEach((message,index)=>{const row=document.createElement('div');row.className='mes';row.setAttribute('mesid',index);const text=document.createElement('div');text.className='mes_text';text.innerHTML=ctx.messageFormatting(message.mes,message.name,message.is_system,message.is_user,index);row.append(text);box.append(row)})};
 window.__switchChat=async(id,name='演示角色 '+id)=>{chats.set(ctx.getCurrentChatId(),{chat:ctx.chat,metadata:ctx.chatMetadata,character:ctx.characters[0]});let next=chats.get(id);if(!next){next={chat:[{name,is_user:false,is_system:false,mes:'另一位人物的新开场。',swipe_id:0}],metadata:{other_extension:{keep:true}},character:{name,avatar:id+'.png',data:{description:'另一位虚构人物。'}}};chats.set(id,next)}window.__chatId=id;ctx.chat=next.chat;ctx.chatMetadata=next.metadata;ctx.characters[0]=next.character;ctx.name2=next.character.name;window.__renderChat();await window.__emit('CHAT_CHANGED')};
 window.__reply=async(text)=>{await window.__emit('GENERATION_STARTED','normal',{},false);ctx.chat.push({name:'玩家',is_user:true,is_system:false,mes:'继续',swipe_id:0},{name:ctx.name2,is_user:false,is_system:false,mes:text,swipe_id:0});window.__renderChat();const floor=ctx.chat.length-1;await window.__emit('MESSAGE_RECEIVED',floor,'normal');await window.__emit('CHARACTER_MESSAGE_RENDERED',floor,'normal');await window.__emit('GENERATION_ENDED');return floor};
 const nativeFetch=window.fetch.bind(window);
 window.fetch=async(url,opts={})=>{const address=new URL(String(url),location.href);if(address.origin!==location.origin)throw Error('预览禁止外部请求');if(!address.pathname.startsWith('/api/'))return nativeFetch(url,opts);const body=JSON.parse(opts.body||'{}');window.__requests.push({kind:'secondary',body});await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,window.__mockDelay);opts.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('cancelled','AbortError'))},{once:true})});if(address.pathname.endsWith('/status'))return Response.json({data:[{id:'preview-model'}]});return Response.json({choices:[{finish_reason:window.__finishReason,message:{content:body.messages?.some(m=>m.content.includes('两个字符'))?'ok':window.__mockResponse}}]})};
 window.toastr={error:message=>{window.__startupError=message;document.documentElement.dataset.previewReady='false'}};
 window.addEventListener('libei:v2-ready',()=>{window.__readyCount++;document.documentElement.dataset.previewReady='true'});
 window.__renderChat();
})();
