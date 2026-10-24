const processUrl='https://oklzhsljbqjfpxmgpcfz.supabase.co/functions/v1/marketplace-process';
const $=id=>document.getElementById(id);

const canal=$('canal');
const arquivo=$('arquivo');
const opkey=$('opkey');
const opkeyHistory=$('opkeyHistory');
const validar=$('validar');
const baixarModelo=$('baixarModelo');
const oferta=$('oferta');
const enviar=$('enviar');
const resumo=$('resumo');
const total=$('total');
const prontos=$('prontos');
const erros=$('erros');
const tbody=$('tbody');
const dmhBox=$('dmhBox');
const dmhResult=$('dmhResult');
const finalBox=$('finalBox');
const finalResult=$('finalResult');
const raw=$('raw');
const batchProgress=$('batchProgress');
const batchProgressTitle=$('batchProgressTitle');
const batchProgressText=$('batchProgressText');
const batchProgressPercent=$('batchProgressPercent');
const batchProgressBar=$('batchProgressBar');
const batchTotal=$('batchTotal');
const batchSuccess=$('batchSuccess');
const batchProcessing=$('batchProcessing');
const batchErrors=$('batchErrors');
const statusId=$('statusId');
const statusCpf=$('statusCpf');
const consultarStatus=$('consultarStatus');
const atualizarTodos=$('atualizarTodos');
const statusMessage=$('statusMessage');
const statusTbody=$('statusTbody');

const histTotal=$('histTotal');
const histSuccess=$('histSuccess');
const histProcessing=$('histProcessing');
const histNoQuote=$('histNoQuote');

const reportTotal=$('reportTotal');
const reportSuccess=$('reportSuccess');
const reportProcessing=$('reportProcessing');
const reportQuote=$('reportQuote');
const reportChannelTbody=$('reportChannelTbody');
const reportHealth=$('reportHealth');
const reportUpdatedAt=$('reportUpdatedAt');
const reportBatchTbody=$('reportBatchTbody');
const catalogRefresh=$('catalogRefresh');
const catalogSearch=$('catalogSearch');
const catalogChannel=$('catalogChannel');
const catalogFinanceFilter=$('catalogFinanceFilter');
const catalogExport=$('catalogExport');
const catalogCards=$('catalogCards');
const catalogCourseFilter=$('catalogCourseFilter');
const catalogStateFilter=$('catalogStateFilter');
const catalogCityFilter=$('catalogCityFilter');
const catalogUnitFilter=$('catalogUnitFilter');
const catalogSelectedUnits=new Map();
const catalogTotal=$('catalogTotal');
const catalogFinancial=$('catalogFinancial');
const catalogNoFinancial=$('catalogNoFinancial');
const catalogCheckedAt=$('catalogCheckedAt');
const catalogCountText=$('catalogCountText');
const catalogMessage=$('catalogMessage');
let catalogOffers=[];
let catalogMeta=null;
let catalogScrollId=null;
let catalogLoadedCount=0;
let catalogHasMore=false;
let catalogLoadMoreButton=null;
let catalogExporting=false;

let channels=[
[99,'Vai de bolsa - Marketplace'],[97,'Digdu - Marketplace'],[96,'Vou de bolsa - Marketplace'],
[94,'Amigo edu - Marketplace'],[98,'Quero bolsa - Marketplace'],[95,'Educa mais brasil - Marketplace'],
[127,'Casa do Universitário - Marketplace'],[113,'Edupass - Marketplace'],[114,'Neora - Marketplace'],
[120,'Elleve - Marketplace'],[139,'Infinity - Marketplace'],[140,'Galati - Marketplace'],
[141,'Inovit - Marketplace'],[146,'Bolsa Convênio Empresa C/ Garantia - Marketplace'],
[124,'Bolsa mais brasil - Marketplace'],[155,'Único Skill - Marketplace'],
[156,'Pravaler - Marketplace'],[157,'Faça Acontecer (SICOB) - Marketplace'],
[158,'Ficou Fácil (Santander) - Marketplace'],[159,'Instituto FEPAF - Marketplace'],
[160,'Conect Car - Marketplace'],[162,'Omverso - Marketplace']
];

const templateColumns=[
'cpf','nome','email','celular','dataNascimento','sexo','rg','anoConclusaoEnsinoMedio',
'cep','logradouro','numero','complemento','bairro','cidade','uf','businessKeyOferta'
];
const required=templateColumns.filter(column=>column!=='complemento');

function normalizeCpf(value){
  let digits=String(value??'').replace(/\D/g,'');
  const leadingZeroAdded=digits.length===10;
  if(leadingZeroAdded) digits='0'+digits;
  return {
    valid:digits.length===11,
    digits,
    formatted:digits.length===11
      ? digits.slice(0,3)+'.'+digits.slice(3,6)+'.'+digits.slice(6,9)+'-'+digits.slice(9)
      : String(value??'').trim(),
    leadingZeroAdded
  };
}

function isBusinessConfirmedResponse(response){
  return Boolean(response?.businessConfirmed||response?.processing?.readyForNextStep||
    isMarketplaceScholarshipApplied({businessOutcome:response?.processing?.businessOutcome||null}));
}

const TRACKING_KEY='marketplace_tracking_v2';
const BATCHES_KEY='marketplace_batches_v1';
const MAX_SAVED_BATCHES=8;
const MAX_BATCH_SIZE=500;
const PREVIEW_CONCURRENCY=5;
const SUBMIT_CONCURRENCY=3;
const OPERATOR_SESSION_KEY='marketplace_operator_key_session';
const AUTO_REFRESH_MS=60000;
let validRows=[];
let previewRows=[];
let dmhExportRows=[];
let offerApprovedRows=[];
let offerPreviewResults=[];
let trackingRows=loadTracking();
let batchRows=loadBatches();
let refreshInProgress=false;

init();

function init(){
  bindNavigation();
  bindKeySync();
  loadChannels();
  bindCatalog();
  renderTracking();
  renderReports();
  const savedKey=sessionStorage.getItem(OPERATOR_SESSION_KEY)||'';
  if(savedKey){opkey.value=savedKey;opkeyHistory.value=savedKey;}
  canal.addEventListener('change',()=>{
    offerApprovedRows=[];
    offerPreviewResults=[];
    dmhBox.classList.add('hidden');
    finalBox.classList.add('hidden');
    enviar.disabled=true;
  });
}

function bindNavigation(){
  document.querySelectorAll('[data-view]').forEach(btn=>{
    btn.addEventListener('click',()=>switchView(btn.dataset.view));
  });

  finalResult?.addEventListener('click',e=>{
    if(e.target.closest('[data-go-history]')) switchView('historico');
  });
}

function switchView(view){
  const map={
    nova:$('viewNova'),
    historico:$('viewHistorico'),
    relatorios:$('viewRelatorios'),
    catalogo:$('viewCatalogo')
  };

  Object.entries(map).forEach(([name,el])=>el?.classList.toggle('active',name===view));
  document.querySelectorAll('[data-view]').forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.view===view);
  });

  if(view==='historico') renderTracking();
  if(view==='relatorios') renderReports();
  if(view==='catalogo' && !catalogOffers.length) { /* load on explicit user action */ }
  window.scrollTo({top:0,behavior:'smooth'});
}

function bindCatalog(){
  catalogRefresh?.addEventListener('click',loadOfferCatalog);
  if(catalogCountText&&!catalogLoadMoreButton){
    catalogLoadMoreButton=document.createElement('button');
    catalogLoadMoreButton.id='catalogLoadMore';
    catalogLoadMoreButton.className='btn btn-secondary';
    catalogLoadMoreButton.textContent='Carregar próximas ofertas';
    catalogLoadMoreButton.hidden=true;
    catalogLoadMoreButton.style.marginTop='8px';
    catalogCountText.insertAdjacentElement('afterend',catalogLoadMoreButton);
    catalogLoadMoreButton.addEventListener('click',loadNextCatalogPage);
  }
  catalogSearch?.addEventListener('input',renderCatalog);
  catalogCourseFilter?.addEventListener('input',renderCatalog);
  catalogStateFilter?.addEventListener('change',()=>{if(catalogCityFilter)catalogCityFilter.value='';if(catalogUnitFilter)catalogUnitFilter.value='';renderCatalog();});
  catalogCityFilter?.addEventListener('change',()=>{if(catalogUnitFilter)catalogUnitFilter.value='';renderCatalog();});
  catalogUnitFilter?.addEventListener('change',renderCatalog);
  catalogCards?.addEventListener('change',event=>{
    const select=event.target.closest('[data-unit-select]');
    if(!select)return;
    catalogSelectedUnits.set(select.dataset.groupKey,select.value);
    renderCatalog();
  });
  catalogChannel?.addEventListener('change',renderCatalog);
  catalogFinanceFilter?.addEventListener('change',renderCatalog);
  catalogExport?.addEventListener('click',exportOfferCatalog);
  if(catalogChannel){
    catalogChannel.innerHTML='<option value="">Todos os canais</option>'+channels.slice().sort((a,b)=>String(a[1]).localeCompare(String(b[1]),'pt-BR')).map(c=>'<option value="'+c[0]+'">'+esc(c[1])+' — '+c[0]+'</option>').join('');
  }
}

function catalogMoney(value){
  if(value===null||value===undefined||value==='') return '—';
  const n=Number(value);
  return Number.isFinite(n)?n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):String(value);
}
function catalogDate(value){
  if(!value) return '—';
  const d=new Date(value);
  return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString('pt-BR');
}
function catalogChannels(offer){
  return Array.isArray(offer.channels)?offer.channels.map(c=>(c.name||('Canal '+c.id))+' ('+c.id+')').join(', '):'—';
}
function catalogFinancialValue(offer,field){
  const f=Array.isArray(offer.financialOffers)?offer.financialOffers[0]:null;
  return f?.[field]??'';
}
function catalogEscapeJson(value){
  if(value===undefined||value===null) return '';
  return typeof value==='object'?JSON.stringify(value):String(value);
}
function catalogFlatten(obj,prefix='',out={}){
  if(obj===null||obj===undefined){if(prefix)out[prefix]='';return out;}
  if(Array.isArray(obj)){out[prefix]=JSON.stringify(obj);return out;}
  if(typeof obj!=='object'){if(prefix)out[prefix]=obj;return out;}
  const keys=Object.keys(obj);
  if(!keys.length&&prefix)out[prefix]='{}';
  for(const key of keys){
    const path=prefix?prefix+'.'+key:key;
    const value=obj[key];
    if(value && typeof value==='object' && !Array.isArray(value)) catalogFlatten(value,path,out);
    else out[path]=Array.isArray(value)?JSON.stringify(value):(value??'');
  }
  return out;
}
async function catalogRequest(action,extra={}){
  const key=getOperatorKey();
  const response=await fetch(processUrl,{
    method:'POST',headers:{'content-type':'application/json','x-operator-key':key},
    body:JSON.stringify({action,...extra})
  });
  const data=await response.json();
  if(!response.ok||!data.ok) throw new Error(data.error||'Não foi possível consultar o catálogo.');
  return data;
}
function updateCatalogCounters(data,reset=false){
  if(reset){
    catalogTotal.textContent=Number(data.totalAcademic??0).toLocaleString('pt-BR');
    catalogCheckedAt.textContent=new Date(data.checkedAt||Date.now()).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  }
  catalogFinancial.textContent=catalogOffers.filter(o=>o.hasFinancialOffer).length.toLocaleString('pt-BR');
  catalogNoFinancial.textContent=catalogOffers.filter(o=>!o.hasFinancialOffer).length.toLocaleString('pt-BR');
  catalogCountText.textContent=catalogLoadedCount.toLocaleString('pt-BR')+' oferta(s) carregada(s) de '+Number(catalogMeta?.totalAcademic??0).toLocaleString('pt-BR')+'.';
  if(catalogLoadMoreButton){
    catalogLoadMoreButton.hidden=!catalogHasMore;
    catalogLoadMoreButton.disabled=catalogExporting;
    catalogLoadMoreButton.textContent=catalogExporting?'Exportação em andamento...':'Carregar próximas ofertas';
  }
}
async function loadOfferCatalog(){
  const key=getOperatorKey();
  if(!key){
    catalogMessage.classList.remove('hidden');
    catalogMessage.textContent='Informe a chave de operação na tela Nova carga antes de consultar o DMH.';
    switchView('nova');opkey?.focus();return;
  }
  catalogRefresh.disabled=true;catalogRefresh.textContent='Consultando...';
  catalogMessage.classList.remove('hidden');
  catalogMessage.textContent='Iniciando consulta paginada no DMH. A primeira página será carregada agora.';
  if(catalogLoadMoreButton) catalogLoadMoreButton.hidden=true;
  try{
    const data=await catalogRequest('catalog',{pageSize:5000});
    catalogOffers=Array.isArray(data.offers)?data.offers:[];
    catalogMeta=data;catalogScrollId=data.scrollId||null;
    catalogLoadedCount=catalogOffers.length;
    catalogHasMore=Boolean(data.hasMore&&catalogScrollId);
    updateCatalogCounters(data,true);
    catalogMessage.textContent='Primeira página carregada. O DMH informa '+Number(data.totalAcademic||0).toLocaleString('pt-BR')+' ofertas acadêmicas. Os cards e indicadores financeiros refletem as páginas carregadas; use “Carregar próximas ofertas” para navegar ou “Exportar Excel completo” para gerar o catálogo integral em partes.';
    catalogExport.disabled=!catalogOffers.length;
    renderCatalog();
  }catch(error){
    catalogMessage.textContent='Não foi possível carregar o catálogo: '+(error?.message||String(error));
    catalogOffers=[];catalogMeta=null;catalogScrollId=null;catalogLoadedCount=0;catalogHasMore=false;
    catalogExport.disabled=true;
    catalogCards.innerHTML='<div class="catalog-empty">Catálogo indisponível. Confira a publicação da função de backend e tente novamente.</div>';
    catalogCountText.textContent='Nenhuma oferta carregada.';
  }finally{
    catalogMessage.classList.remove('hidden');catalogRefresh.disabled=false;catalogRefresh.textContent='Consultar DMH';
  }
}
async function loadNextCatalogPage(){
  if(!catalogScrollId||!catalogHasMore||catalogExporting)return;
  catalogLoadMoreButton.disabled=true;catalogLoadMoreButton.textContent='Carregando...';
  catalogMessage.classList.remove('hidden');catalogMessage.textContent='Carregando a próxima página do catálogo...';
  try{
    const data=await catalogRequest('catalog-next',{scrollId:catalogScrollId});
    const next=Array.isArray(data.offers)?data.offers:[];
    catalogOffers.push(...next);catalogLoadedCount+=next.length;
    catalogScrollId=data.scrollId||null;catalogHasMore=Boolean(data.hasMore&&catalogScrollId&&next.length);
    updateCatalogCounters(data,false);renderCatalog();
    catalogMessage.textContent=next.length
      ? 'Página carregada. Já foram carregadas '+catalogLoadedCount.toLocaleString('pt-BR')+' de '+Number(catalogMeta?.totalAcademic||0).toLocaleString('pt-BR')+' ofertas.'
      : 'Não há mais ofertas para carregar. Se a sessão expirou, clique em “Consultar DMH” para reiniciar.';
  }catch(error){
    catalogMessage.textContent='Falha ao carregar a próxima página: '+(error?.message||String(error))+'. Se necessário, clique em “Consultar DMH” para reiniciar.';
    catalogHasMore=false;catalogScrollId=null;updateCatalogCounters({},false);
  }finally{
    if(catalogLoadMoreButton){catalogLoadMoreButton.disabled=false;catalogLoadMoreButton.textContent='Carregar próximas ofertas';}
  }
}

function catalogNormalizeKey(value){
  return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
}
function catalogFieldValues(offer,aliases){
  const accepted=new Set(aliases.map(catalogNormalizeKey));
  const values=[];
  const seen=new Set();
  const add=value=>{
    if(value===undefined||value===null)return;
    if(typeof value==='object'){
      if(Array.isArray(value)){value.forEach(add);return;}
      const preferred=value.name??value.title??value.description??value.label??value.value??value.text;
      if(preferred!==undefined&&preferred!==null)add(preferred);
      return;
    }
    const text=String(value).trim();
    if(text&&!seen.has(text)){seen.add(text);values.push(text);}
  };
  const aliasesNormalized=[...accepted].filter(alias=>alias.length>=4);
  const walk=(node,depth=0)=>{
    if(node===undefined||node===null||depth>12)return;
    if(Array.isArray(node)){node.forEach(value=>walk(value,depth+1));return;}
    if(typeof node!=='object')return;
    for(const [key,value] of Object.entries(node)){
      const normalizedKey=catalogNormalizeKey(key);
      const matched=accepted.has(normalizedKey)||aliasesNormalized.some(alias=>normalizedKey.startsWith(alias)||normalizedKey.endsWith(alias));
      if(matched)add(value);
      if(value&&typeof value==='object')walk(value,depth+1);
    }
  };
  // Location fields may be in either the normalized offer or the original DMH payload.
  walk(offer);
  if(offer?.rawAcademic&&offer.rawAcademic!==offer)walk(offer.rawAcademic);
  return values;
}
function catalogCourse(offer){
  return String(
    catalogFieldValues(offer, [
      'courseName', 'course', 'curso', 'nomeCurso',
      'courseDescription', 'nomeDoCurso',
      'academicCourseName', 'courseTitle',
      'courseLabel', 'descricaoCurso'
    ])[0] || offer?.name || 'Curso não informado'
  ).trim();
}
function catalogState(offer){
  return catalogFieldValues(offer,['state','stateName','stateCode','stateAcronym','stateDescription','uf','ufName','ufCode','province','estado','estadoNome','estadoSigla','siglaEstado','unidadeFederativa','federativeUnit'])[0]||'';
}
function catalogCity(offer){
  return catalogFieldValues(offer,['city','cityName','cityCode','cityDescription','cityLabel','cityOfUnit','campusCity','locationCity','locality','municipality','municipalityName','municipalityDescription','municipio','municipioNome','cidade','cidadeNome','cidadeDescricao','nomeCidade','municipioDescricao','county'])[0]||'';
}
function catalogUnits(offer){
  return catalogFieldValues(offer,['unit','unitName','unitCode','unitDescription','unitLabel','unitOfStudy','schoolUnit','schoolUnitName','educationUnit','educationUnitName','campus','campusName','campusCode','campusDescription','campusUnitName','branchName','polo','poloName','unidade','unidadeNome','unidadeDescricao','nomeUnidade','institucionalUnit']);
}
function catalogUnit(offer){
  return catalogUnits(offer)[0]||'';
}
function catalogModality(offer){
  return catalogFieldValues(offer,['modality','modalityName','modalidade','tipoModalidade','teachingModality','modalityDescription'])[0]||'';
}
function catalogShift(offer){
  return catalogFieldValues(offer,['shift','shiftName','turno','period','periodName','turnName','timeOfDay','timeOfDayName'])[0]||'';
}
function catalogOfferIdentity(offer,index=0){
  return String(offer?.idDMH||offer?.businessKey||('catalog-offer-'+index));
}
function catalogGroupKey(offer,index=0){
  const course=catalogCourse(offer),city=catalogCity(offer),unit=catalogUnit(offer);
  if(!city||!unit)return 'single:'+catalogOfferIdentity(offer,index);
  return JSON.stringify([course.toLocaleLowerCase('pt-BR'),city.toLocaleLowerCase('pt-BR'),catalogModality(offer).toLocaleLowerCase('pt-BR'),catalogShift(offer).toLocaleLowerCase('pt-BR')]);
}
function updateCatalogLocationOptions(){
  const previousState=catalogStateFilter?.value||'';
  const previousCity=catalogCityFilter?.value||'';
  const previousUnit=catalogUnitFilter?.value||'';
  const sortValues=values=>[...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  const states=sortValues(catalogOffers.map(catalogState));
  if(catalogStateFilter){
    catalogStateFilter.innerHTML='<option value="">Todos os estados</option>'+states.map(value=>'<option value="'+esc(value)+'">'+esc(value)+'</option>').join('');
    if(states.includes(previousState))catalogStateFilter.value=previousState;
  }
  const state=catalogStateFilter?.value||'';
  const stateRows=catalogOffers.filter(offer=>!state||catalogState(offer)===state);
  const cities=sortValues(stateRows.map(catalogCity));
  if(catalogCityFilter){
    catalogCityFilter.innerHTML='<option value="">Todas as cidades</option>'+cities.map(value=>'<option value="'+esc(value)+'">'+esc(value)+'</option>').join('');
    if(cities.includes(previousCity))catalogCityFilter.value=previousCity;
  }
  const city=catalogCityFilter?.value||'';
  const cityRows=stateRows.filter(offer=>!city||catalogCity(offer)===city);
  const units=sortValues(cityRows.map(catalogUnit));
  if(catalogUnitFilter){
    catalogUnitFilter.innerHTML='<option value="">Todas as unidades</option>'+units.map(value=>'<option value="'+esc(value)+'">'+esc(value)+'</option>').join('');
    if(units.includes(previousUnit))catalogUnitFilter.value=previousUnit;
  }
}
function filteredCatalogOffers(source=catalogOffers){
  const q=String(catalogSearch?.value||'').trim().toLowerCase();
  const course=String(catalogCourseFilter?.value||'').trim().toLowerCase();
  const state=String(catalogStateFilter?.value||'');
  const city=String(catalogCityFilter?.value||'');
  const unit=String(catalogUnitFilter?.value||'');
  const channel=String(catalogChannel?.value||'');
  const finance=String(catalogFinanceFilter?.value||'');
  return source.filter(o=>{
    const text=[o.idDMH,o.businessKey,o.name,o.source].join(' ').toLowerCase();
    if(q&&!text.includes(q))return false;
    if(course&&!catalogCourse(o).toLowerCase().includes(course))return false;
    if(state&&catalogState(o)!==state)return false;
    if(city&&catalogCity(o)!==city)return false;
    if(unit&&catalogUnit(o)!==unit)return false;
    if(channel&&!o.channels?.some(c=>String(c.id)===channel))return false;
    if(finance==='yes'&&!o.hasFinancialOffer)return false;
    if(finance==='no'&&o.hasFinancialOffer)return false;
    return true;
  });
}
function catalogCardGroups(rows){
  const grouped=new Map();
  rows.forEach((offer,index)=>{
    const key=catalogGroupKey(offer,index);
    if(!grouped.has(key))grouped.set(key,{key,offers:[]});
    grouped.get(key).offers.push(offer);
  });
  return [...grouped.values()].map(group=>{
    const byUnit=new Map();
    group.offers.forEach((offer,index)=>{
      const unit=catalogUnit(offer);
      const key=unit||catalogOfferIdentity(offer,index);
      if(!byUnit.has(key))byUnit.set(key,offer);
    });
    return {...group,offers:[...byUnit.values()]};
  });
}
function renderCatalog(){
  if(!catalogCards)return;
  updateCatalogLocationOptions();
  const rows=filteredCatalogOffers();
  catalogCountText.textContent=rows.length.toLocaleString('pt-BR')+' oferta(s) exibida(s) de '+catalogOffers.length.toLocaleString('pt-BR')+' carregada(s).';
  if(!rows.length){
    catalogCards.innerHTML='<div class="catalog-empty">'+(catalogOffers.length?'Nenhuma oferta corresponde aos filtros.':'Consulte o DMH para carregar o catálogo.')+'</div>';
    return;
  }
  const groups=catalogCardGroups(rows);
  catalogCards.innerHTML=groups.map(group=>{
    const selectedKey=catalogSelectedUnits.get(group.key);
    const selected=group.offers.find((offer,index)=>catalogOfferIdentity(offer,index)===selectedKey)||group.offers[0];
    const fin=Array.isArray(selected.financialOffers)?selected.financialOffers[0]||{}:{};
    const unit=catalogUnit(selected);
    const city=catalogCity(selected);
    const state=catalogState(selected);
    const modality=catalogModality(selected);
    const shift=catalogShift(selected);
    const installments = Array.isArray(fin.installments)
  ? fin.installments
  : [];

const firstInstallment =
  installments.find(item => Number(item?.netValue) > 0)
  || installments[0]
  || {};

const price =
  firstInstallment.netValue
  ?? fin.subscriptionValue
  ?? fin.firstValue
  ?? fin.offerValue
  ?? fin.baseValue;
    const unitControl=group.offers.length>1
      ? '<select class="catalog-unit-select" data-unit-select data-group-key="'+esc(group.key)+'" aria-label="Escolher unidade">'+group.offers.map((offer,index)=>{
          const identity=catalogOfferIdentity(offer,index);
          const label=catalogUnit(offer)||('Unidade '+(index+1));
          return '<option value="'+esc(identity)+'" '+(identity===catalogOfferIdentity(selected,group.offers.indexOf(selected))?'selected':'')+'>'+esc(label)+'</option>';
        }).join('')+'</select>'
      : '<strong>'+esc(unit||'Unidade não informada')+'</strong>';
    const channelNames=catalogChannels(selected);
    return '<article class="offer-card">'+
      '<div class="offer-card-top"><span class="offer-origin">'+esc(selected.source||'Marketplace')+'</span><span class="catalog-pill '+(selected.hasFinancialOffer?'good':'bad')+'">'+(selected.hasFinancialOffer?'Dados financeiros':'Sem financeiro')+'</span></div>'+
      '<h3>'+esc(catalogCourse(selected))+'</h3>'+
      '<p class="offer-card-subtitle">'+[modality,shift].filter(Boolean).map(esc).join(' / ')+'</p>'+
      '<div class="offer-price-label">'+(price!==undefined&&price!==null&&price!==''?'Valor da oferta':'Valor não informado')+'</div>'+
      '<div class="offer-price">'+(price!==undefined&&price!==null&&price!==''?esc(catalogMoney(price)):'Consulte as condições')+'</div>'+
      '<div class="offer-card-details">'+
        '<div><span>Estado</span><strong>'+esc(state||'Estado não informado')+'</strong></div>'+
        '<div><span>Cidade</span><strong>'+esc(city||'Cidade não informada')+'</strong></div>'+
        '<div><span>Unidade</span>'+unitControl+'</div>'+
      '</div>'+
      '<p class="offer-validity"><span>Vigência</span> '+esc(catalogDate(selected.validFrom))+' – '+esc(catalogDate(selected.expiredAt))+'</p>'+
      '<details class="offer-more"><summary>Ver detalhes da oferta</summary>'+
        '<p><strong>Business Key</strong><code>'+esc(selected.businessKey||'—')+'</code></p>'+
        '<p><strong>ID DMH:</strong> '+esc(selected.idDMH||'—')+'</p>'+
        '<p><strong>Matrícula:</strong> '+esc(catalogMoney(fin.enrollmentValue))+'</p>'+
        '<p><strong>Parcelas:</strong> '+esc(Array.isArray(fin.installments)?fin.installments.length+' registro(s)':(fin.installments??'—'))+'</p>'+
        '<p><strong>Canais:</strong> '+esc(channelNames)+'</p>'+
      '</details>'+
    '</article>';
  }).join('');
}
function catalogExportRows(rows){
  const academicRows=rows.map(o=>{
    const base={};
    for(const [key,value] of Object.entries(o)){
      if(key==='financialOffers'||key==='rawAcademic') continue;
      base[key]=value&&typeof value==='object'?JSON.stringify(value):value;
    }
    base.financialOffersJson=JSON.stringify(o.financialOffers||[]);
    return {...catalogFlatten(o.rawAcademic||{},'academic'),...catalogFlatten(base,'catalog')};
  });
  const financialRows=[];
  rows.forEach(o=>(o.financialOffers||[]).forEach((f,index)=>{
    financialRows.push({idDMH:o.idDMH,businessKey:o.businessKey,offerName:o.name,financialIndex:index+1,...catalogFlatten(f,'financial')});
  }));
  return {academicRows,financialRows};
}
function createCatalogWorkbook(rows,partNumber,totalParts){
  const {academicRows,financialRows}=catalogExportRows(rows);
  const wb=XLSX.utils.book_new();
  const summary=XLSX.utils.aoa_to_sheet([
    ['Relatório','Catálogo de ofertas DMH'],['Data da consulta',catalogMeta?.checkedAt||''],
    ['Parte',partNumber+' de '+totalParts],['Ofertas acadêmicas neste arquivo',academicRows.length],
    ['Ofertas com financeiro',rows.filter(o=>o.hasFinancialOffer).length],
    ['Ofertas sem financeiro',rows.filter(o=>!o.hasFinancialOffer).length],
    ['Total informado pelo DMH',catalogMeta?.totalAcademic??''],
    ['Filtro aplicado',catalogSearch?.value||'Nenhum'],
    ['Canal selecionado',catalogChannel?.value||'Todos'],
    ['Filtro financeiro',catalogFinanceFilter?.selectedOptions?.[0]?.textContent||'Todas']
  ]);
  const academicHeaders=[...new Set(academicRows.flatMap(row=>Object.keys(row)))];
  const financialHeaders=[...new Set(financialRows.flatMap(row=>Object.keys(row)))];
  const academic=XLSX.utils.json_to_sheet(academicRows.length?academicRows:[{resultado:'Nenhuma oferta'}],{header:academicHeaders.length?academicHeaders:['resultado']});
  const finance=XLSX.utils.json_to_sheet(financialRows.length?financialRows:[{resultado:'Nenhuma oferta financeira associada'}],{header:financialHeaders.length?financialHeaders:['resultado']});
  [academic,finance].forEach(ws=>{
    ws['!autofilter']={ref:ws['!ref']||'A1:A1'};
    ws['!freeze']={xSplit:0,ySplit:1};
  });
  academic['!cols']=Object.keys(academicRows[0]||{}).map(k=>({wch:Math.min(42,Math.max(14,k.length+2))}));
  finance['!cols']=Object.keys(financialRows[0]||{}).map(k=>({wch:Math.min(42,Math.max(14,k.length+2))}));
  XLSX.utils.book_append_sheet(wb,summary,'Resumo');
  XLSX.utils.book_append_sheet(wb,academic,'Ofertas acadêmicas');
  XLSX.utils.book_append_sheet(wb,finance,'Ofertas financeiras');
  return XLSX.write(wb,{bookType:'xlsx',type:'array'});
}
async function exportOfferCatalog(){
  if(!window.XLSX||!catalogOffers.length)return alert('Consulte o DMH antes de exportar.');
  if(catalogExporting)return;
  const key=getOperatorKey();if(!key)return alert('Informe a chave de operação na tela Nova carga.');
  const total=Number(catalogMeta?.totalAcademic||catalogOffers.length);
  const batchLimit=25000;
  const estimatedParts=Math.max(1,Math.ceil(total/batchLimit));
  const confirmText='O DMH informa '+total.toLocaleString('pt-BR')+' ofertas. Para evitar travamentos, o catálogo será baixado em vários arquivos Excel de até 5.000 ofertas cada, em vez de montar um ZIP gigante na memória. O navegador poderá pedir autorização para vários downloads. Deseja continuar?';
  if(!confirm(confirmText))return;

  catalogExporting=true;catalogExport.disabled=true;catalogRefresh.disabled=true;
  if(catalogLoadMoreButton){catalogLoadMoreButton.disabled=true;catalogLoadMoreButton.textContent='Exportação em andamento...';}
  let batch=[];let part=0;let scanned=0;let matched=0;let scrollId=catalogScrollId;let hasMore=catalogHasMore;
  const applyCurrentFilters=rows=>filteredCatalogOffers(rows);

  async function downloadPart(){
    if(!batch.length)return;
    part++;
    catalogMessage.textContent='Gerando arquivo Excel '+part+'... '+scanned.toLocaleString('pt-BR')+' ofertas lidas; '+matched.toLocaleString('pt-BR')+' incluídas após os filtros.';
    await new Promise(resolve=>setTimeout(resolve,0));
    const bytes=createCatalogWorkbook(batch,part,estimatedParts);
    const blob=new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download='catalogo_ofertas_dmh_parte_'+String(part).padStart(3,'0')+'.xlsx';
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),120000);
    batch=[];
    catalogMessage.textContent='Arquivo '+part+' baixado. Progresso: '+scanned.toLocaleString('pt-BR')+' ofertas lidas de aproximadamente '+total.toLocaleString('pt-BR')+'; '+matched.toLocaleString('pt-BR')+' incluídas.';
    // Dá tempo ao navegador para iniciar o download e liberar memória antes do próximo arquivo.
    await new Promise(resolve=>setTimeout(resolve,1200));
  }

  try{
    catalogMessage.classList.remove('hidden');
    let rows=applyCurrentFilters(catalogOffers);
    scanned+=catalogOffers.length;matched+=rows.length;batch.push(...rows);
    while(batch.length>=batchLimit){
      const remainder=batch.splice(batchLimit);
      await downloadPart();
      batch=remainder;
    }
    while(hasMore&&scrollId){
      const data=await catalogRequest('catalog-next',{scrollId});
      const page=Array.isArray(data.offers)?data.offers:[];
      scrollId=data.scrollId||null;hasMore=Boolean(data.hasMore&&scrollId&&page.length);
      scanned+=page.length;
      rows=applyCurrentFilters(page);matched+=rows.length;
      let pos=0;
      while(pos<rows.length){
        const capacity=batchLimit-batch.length;
        const take=rows.slice(pos,pos+capacity);batch.push(...take);pos+=take.length;
        if(batch.length>=batchLimit)await downloadPart();
      }
      catalogMessage.textContent='Lendo DMH: '+scanned.toLocaleString('pt-BR')+' de aproximadamente '+total.toLocaleString('pt-BR')+' ofertas. '+matched.toLocaleString('pt-BR')+' incluídas após os filtros.';
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    await downloadPart();
    if(!part){
      batch=[{idDMH:'',businessKey:'',name:'Nenhuma oferta corresponde aos filtros.'}];
      await downloadPart();
    }
    catalogScrollId=null;catalogHasMore=false;
    catalogMessage.textContent='Exportação concluída: '+scanned.toLocaleString('pt-BR')+' ofertas lidas; '+matched.toLocaleString('pt-BR')+' exportadas em '+part+' arquivo(s) Excel. Confira a pasta Downloads.';
  }catch(error){
    catalogMessage.textContent='A exportação foi interrompida após '+part+' arquivo(s): '+(error?.message||String(error))+'. Os arquivos já baixados continuam disponíveis na pasta Downloads. Clique em “Consultar DMH” para reiniciar a sessão antes de tentar novamente.';
    catalogScrollId=null;catalogHasMore=false;
  }finally{
    catalogExporting=false;catalogExport.disabled=!catalogOffers.length;catalogRefresh.disabled=false;
    if(catalogLoadMoreButton){catalogLoadMoreButton.disabled=false;catalogLoadMoreButton.textContent='Carregar próximas ofertas';catalogLoadMoreButton.hidden=!catalogHasMore;}
  }
}

function bindKeySync(){
  const sync=(from,to)=>()=>{
    if(to && from.value!==to.value) to.value=from.value;
    const value=String(from.value||'').trim();
    if(value) sessionStorage.setItem(OPERATOR_SESSION_KEY,value);
    else sessionStorage.removeItem(OPERATOR_SESSION_KEY);
  };
  opkey?.addEventListener('input',sync(opkey,opkeyHistory));
  opkeyHistory?.addEventListener('input',sync(opkeyHistory,opkey));
}

function getOperatorKey(){
  return String(opkey?.value||opkeyHistory?.value||'').trim();
}

function populateChannels(){
  const current=canal.value;
  canal.innerHTML=channels
    .slice()
    .sort((a,b)=>String(a[1]).localeCompare(String(b[1]),'pt-BR'))
    .map(x=>'<option value="'+x[0]+'">'+esc(x[1])+' — '+x[0]+'</option>')
    .join('');
  if(current && channels.some(x=>String(x[0])===String(current))) canal.value=current;
}

async function loadChannels(){
  populateChannels();
  try{
    const res=await fetch(processUrl,{method:'GET',cache:'no-store'});
    const data=await res.json();
    if(Array.isArray(data.channels)&&data.channels.length){
      channels=data.channels.map(x=>[Number(x.id),String(x.name)]);
      populateChannels();
    }
  }catch(err){
    console.warn('Usando lista local de canais:',err);
  }
}

baixarModelo.onclick=()=>{
  const workbook=XLSX.utils.book_new();
  const worksheet=XLSX.utils.aoa_to_sheet([templateColumns]);
  worksheet['!freeze']={xSplit:0,ySplit:1};
  worksheet['!autofilter']={ref:'A1:P1'};
  worksheet['!cols']=[
    {wch:16},{wch:34},{wch:34},{wch:18},{wch:18},{wch:10},{wch:16},{wch:25},
    {wch:14},{wch:34},{wch:12},{wch:22},{wch:24},{wch:28},{wch:10},{wch:52}
  ];
  XLSX.utils.book_append_sheet(workbook,worksheet,'MODELO_GRADUACAO');
  XLSX.writeFile(workbook,'modelo_inscricoes_marketplace_graduacao.xlsx');
};

validar.onclick=()=>{
  if(!arquivo.files[0]) return alert('Selecione uma planilha.');
  const rd=new FileReader();

  rd.onload=e=>{
    try{
      const wb=XLSX.read(new Uint8Array(e.target.result),{type:'array'});
      const ws=wb.Sheets['MODELO_GRADUACAO']||wb.Sheets[wb.SheetNames[0]];
      const matrix=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',blankrows:false});
      const receivedColumns=(matrix[0]||[]).map(value=>String(value||'').trim());
      const columnsOk=receivedColumns.length===templateColumns.length &&
        templateColumns.every((column,index)=>receivedColumns[index]===column);
      if(!columnsOk){
        throw new Error(
          'As colunas devem estar exatamente nesta ordem: '+templateColumns.join(', ')+
          '. Baixe e utilize o novo modelo disponível no sistema.'
        );
      }
      const dataRows=XLSX.utils.sheet_to_json(ws,{defval:'',range:1,header:templateColumns})
        .filter(row=>templateColumns.some(column=>String(row[column]??'').trim()!==''))
        .map(row=>{
          const cpf=normalizeCpf(row.cpf);
          return {...row,cpf:cpf.valid?cpf.formatted:row.cpf,_cpfLeadingZeroAdded:cpf.leadingZeroAdded,_linhaPlanilha:undefined};
        });
      if(dataRows.length>MAX_BATCH_SIZE){
        throw new Error('A planilha possui '+dataRows.length+' linhas. O limite por carga é '+MAX_BATCH_SIZE+'.');
      }
      validRows=[];
      previewRows=[];
      dmhExportRows=[];
      offerApprovedRows=[];
      let bad=0;

      tbody.innerHTML=dataRows.map((r,i)=>{
        const miss=required.filter(k=>String(r[k]??'').trim()==='');
        const cpf=normalizeCpf(r.cpf);
        const problems=[...miss.map(x=>'Falta: '+x)];
        if(!cpf.valid) problems.push('CPF deve ter 10 ou 11 dígitos');
        const good=problems.length===0;
        if(good) validRows.push(r); else bad++;
        r._linhaPlanilha=i+2;
        previewRows.push({...r,_statusValidacao:good?'PRONTO':'ERRO',_erroValidacao:problems.join('; ')});

        return '<tr>'+
          '<td>'+(i+2)+'</td>'+
          '<td>'+esc(r.cpf)+'</td>'+
          '<td>'+esc(r.nome)+'</td>'+
          '<td>'+esc(r.businessKeyOferta)+'</td>'+
          '<td>Automático (DMH)</td>'+
          '<td class="'+(good?'ok':'bad')+'">'+(good?'PRONTO':'ERRO')+'</td>'+
          '<td>'+problems.map(esc).join('<br>')+(r._cpfLeadingZeroAdded?'<span class="ok">Zero inicial restaurado automaticamente</span>':'')+'</td>'+
        '</tr>';
      }).join('');

      total.textContent=dataRows.length;
      prontos.textContent=validRows.length;
      erros.textContent=bad;
      resumo.classList.remove('hidden');
      oferta.disabled=validRows.length===0;
      dmhBox.classList.add('hidden');
      finalBox.classList.add('hidden');
      batchProgress.classList.add('hidden');
      enviar.disabled=true;
      enviar.textContent='Enviar lote em Produção';

      if(validRows.length===1&&!statusCpf.value){
        statusCpf.value=String(validRows[0].cpf||'');
      }

      if(!validRows.length) alert('Nenhuma linha está pronta para envio. Corrija os campos indicados.');
    }catch(err){
      alert('Erro ao ler a planilha: '+err.message);
    }
  };

  rd.readAsArrayBuffer(arquivo.files[0]);
};

oferta.onclick=async()=>{
  if(!validRows.length) return;
  const key=getOperatorKey();
  if(!key) return alert('Digite a chave de operação.');

  oferta.disabled=true;
  canal.disabled=true;
  oferta.textContent='Consultando '+validRows.length+' oferta(s)...';

  try{
    showBatchProgress('Validando ofertas no DMH',validRows.length);
    const results=await runPool(validRows,PREVIEW_CONCURRENCY,async(row,index)=>{
      try{return {ok:true,row,response:await callApiWithRetry('preview',row,key),index};}
      catch(error){return {ok:false,row,error,index};}
    },progress=>updateBatchProgress(progress,validRows.length,0,progress,0));

    offerPreviewResults=results;
    dmhExportRows=results.map(x=>({
      linhaPlanilha:Number(x.row?._linhaPlanilha||(x.index??0)+2),
      cpf:String(x.row?.cpf||''),
      nome:String(x.row?.nome||''),
      businessKeyOferta:String(x.row?.businessKeyOferta||''),
      resultadoDMH:x.ok?'OFERTA CONFIRMADA':'ERRO NO DMH',
      idDMH:x.ok?String(x.response?.offer?.idDMH||''):'',
      ofertaDMH:x.ok?String(x.response?.offer?.name||''):'',
      erroResumido:x.ok?'':summarizeValidationError(x.error?.message||'Erro não identificado'),
      erroTecnico:x.ok?'':String(x.error?.message||'Erro não identificado'),
      canaisEncontrados:Array.isArray(x.error?.offerDiagnostic?.availableChannels)?x.error.offerDiagnostic.availableChannels.join(', '):''
    }));
    offerApprovedRows=results.filter(x=>x.ok).map(x=>x.row);
    const rejected=results.filter(x=>!x.ok);
    const first=results.find(x=>x.ok)?.response||{};
    const is155=Number(first.channel?.id||canal.value)===155;

    dmhResult.innerHTML=
      '<div class="offer-summary">'+
        '<div><span>Linhas válidas</span><strong>'+validRows.length+'</strong></div>'+
        '<div><span>Ofertas confirmadas</span><strong>'+offerApprovedRows.length+'</strong></div>'+
        '<div><span>Ofertas com erro</span><strong>'+rejected.length+'</strong></div>'+
        '<div><span>Canal</span><strong>'+esc(channelName(Number(canal.value))+' — '+canal.value)+'</strong></div>'+
      '</div>'+
      (is155
        ? '<div class="validation-box"><b>Regra financeira do canal 155 validada.</b> Bolsa de isenção de 100% em todas as parcelas.</div>'
        : '<div class="validation-box"><b>Consulta concluída.</b> Cada inscrição será enviada usando a oferta correspondente ao canal selecionado.</div>')+
      (rejected.length?'<div class="error offer-list"><b>'+rejected.length+' linha(s) não serão enviadas:</b><br>'+rejected.slice(0,20).map(x=>{
        const diagnostic=x.error?.offerDiagnostic;
        const channels=Array.isArray(diagnostic?.availableChannels)&&diagnostic.availableChannels.length
          ? ' Canais encontrados: '+diagnostic.availableChannels.join(', ')+'.'
          : '';
        const idDMH=diagnostic?.offers?.[0]?.idDMH
          ? ' ID DMH: '+diagnostic.offers[0].idDMH+'.'
          : '';
        return 'Linha '+Number(x.row?._linhaPlanilha||((x.index||0)+2))+': '+esc(summarizeValidationError(x.error.message))+esc(channels+idDMH);
      }).join('<br>')+(rejected.length>20?'<br>… e mais '+(rejected.length-20)+' linha(s). Baixe o Excel para ver todos os erros.':'')+'</div>':'');

    dmhBox.classList.remove('hidden');
    enviar.disabled=offerApprovedRows.length===0;
    enviar.textContent='Enviar '+offerApprovedRows.length+' inscrição(ões) em Produção';
  }catch(err){
    alert(err.message);
  }finally{
    oferta.disabled=false;
    canal.disabled=false;
    oferta.textContent='Consultar oferta no DMH';
  }
};

enviar.onclick=async()=>{
  const key=getOperatorKey();
  if(!key) return alert('Digite a chave de operação.');
  if(!offerApprovedRows.length) return alert('Consulte as ofertas da carga antes de enviar.');
  const count=offerApprovedRows.length;
  if(!confirm('CONFIRMA a criação de '+count+' inscrição(ões) REAIS em PRODUÇÃO no canal '+canal.value+'?')) return;

  enviar.disabled=true;
  oferta.disabled=true;
  canal.disabled=true;
  arquivo.disabled=true;
  validar.disabled=true;
  enviar.textContent='Processando lote...';

  try{
    showBatchProgress('Enviando inscrições em Produção',count);
    const batch=createBatch(validRows.length);
    const previewRejected=offerPreviewResults.filter(x=>!x.ok);
    previewRejected.forEach(result=>saveBatchItem(batch.id,result));

    const results=await runPool(offerApprovedRows,SUBMIT_CONCURRENCY,async(row,index)=>{
      const originalIndex=validRows.indexOf(row);
      const reportIndex=originalIndex>=0?originalIndex:index;
      try{
        const response=await callApiWithRetry('submit',row,key);
        saveSubmittedTracking(response,row);
        const result={ok:true,row,response,index:reportIndex};
        saveBatchItem(batch.id,result);
        return result;
      }catch(error){
        const result={ok:false,row,error,index:reportIndex};
        saveBatchItem(batch.id,result);
        return result;
      }
    },processed=>{
      const completed=trackingRows.filter(x=>x.batchToken===currentBatchToken).length;
      updateBatchProgress(processed,count,completed,Math.max(0,count-processed),processed-completed);
      renderTracking();
      renderReports();
    });

    const succeeded=results.filter(x=>x.ok);
    const confirmed=succeeded.filter(x=>isBusinessConfirmedResponse(x.response));
    const pending=succeeded.filter(x=>!isBusinessConfirmedResponse(x.response));
    const failed=results.filter(x=>!x.ok);
    finishBatch(batch.id,succeeded.length,failed.length+previewRejected.length);
    finalBox.classList.remove('hidden');
    finalResult.innerHTML=
      '<div class="'+((failed.length||previewRejected.length||pending.length)?'warn':'success')+'"><b>Envio concluído.</b><br>'+
      succeeded.length+' solicitação(ões) recebida(s) pela API: '+confirmed.length+' confirmada(s) com inscrição/condição e '+pending.length+' ainda aguardando confirmação. '+
      failed.length+' com falha no envio e '+previewRejected.length+' bloqueada(s) na validação DMH.'+
      (pending.length?'<br><b>Atenção:</b> recebimento pela API não significa inscrição ou bolsa concluída. Acompanhe as pendentes no Histórico.':'')+
      (failed.length?'<br>As linhas com falha podem ser corrigidas e reenviadas em uma nova planilha.':'')+'</div>'+historyButton();
    raw.textContent=JSON.stringify(results.map(x=>x.ok?{linha:x.index+2,ok:true,response:x.response}:{linha:x.index+2,ok:false,error:x.error.message}),null,2);
    renderTracking();
    renderReports();
  }catch(err){
    finalBox.classList.remove('hidden');
    finalResult.innerHTML='<div class="error"><b>Falha:</b> '+esc(err.message)+'</div>';
    raw.textContent=err.raw||'';
  }finally{
    enviar.disabled=true;
    oferta.disabled=false;
    canal.disabled=false;
    arquivo.disabled=false;
    validar.disabled=false;
    enviar.textContent='Lote enviado';
  }
};

function summarizeValidationError(message){
  const text=String(message||'Erro não identificado').replace(/\s+/g,' ').trim();
  if(/Business Key não encontrada no catálogo/i.test(text)) return 'Oferta não localizada no catálogo do DMH';
  if(/vigência está encerrada|fora da vigência/i.test(text)) return 'Oferta fora da vigência';
  if(/vigência ainda não começou/i.test(text)) return 'Oferta ainda não vigente';
  if(/está inativa no DMH/i.test(text)) return 'Oferta inativa no DMH';
  if(/disponível somente nos canais|não está cadastrado para esta oferta/i.test(text)) return 'Oferta não vinculada ao canal selecionado';
  if(/origem não é ATHENAS/i.test(text)) return 'Origem da oferta incompatível';
  if(/mais de uma oferta/i.test(text)) return 'Mais de uma oferta encontrada; precisa de validação';
  if(/oferta financeira correspondente|oferta financeira não corresponde/i.test(text)) return 'Oferta financeira ausente ou incompatível';
  if(/API Key|não autenticada|sem permissão/i.test(text)) return 'Falha de autenticação ou permissão no DMH';
  if(/CPF/i.test(text) && /inválido/i.test(text)) return 'CPF inválido';
  if(/HTTP \d{3}/i.test(text)) return 'Falha na consulta ao serviço DMH';
  return text.length>150?text.slice(0,147)+'...':text;
}

function downloadValidationWorkbook(stage){
  if(!window.XLSX) return alert('Não foi possível carregar o recurso de Excel. Atualize a página e tente novamente.');
  const afterDmh=stage==='dmh';
  const dmhByLine=new Map(dmhExportRows.map(item=>[Number(item.linhaPlanilha),item]));
  const details=previewRows.map(row=>{
    const dmh=dmhByLine.get(Number(row._linhaPlanilha));
    return {
      'Linha da planilha':row._linhaPlanilha,
      'CPF':row.cpf||'',
      'Nome':row.nome||'',
      'E-mail':row.email||'',
      'Celular':row.celular||'',
      'Business Key':row.businessKeyOferta||'',
      'Validação dos dados':row._statusValidacao||'',
      'Erro nos dados':row._erroValidacao||'',
      'Resultado DMH':afterDmh?(dmh?.resultadoDMH||(row._statusValidacao==='ERRO'?'NÃO CONSULTADA — corrigir dados':'NÃO CONSULTADA')):'',
      'Resumo do erro DMH':afterDmh?(dmh?.erroResumido||''):'',
      'Detalhe técnico DMH':afterDmh?(dmh?.erroTecnico||''):'',
      'ID DMH':afterDmh?(dmh?.idDMH||''):'',
      'Oferta encontrada':afterDmh?(dmh?.ofertaDMH||''):'',
      'Canais encontrados':afterDmh?(dmh?.canaisEncontrados||''):''
    };
  });
  const errors=details.filter(row=>row['Validação dos dados']==='ERRO'||row['Resultado DMH']==='ERRO NO DMH');
  const summary=[
    ['Relatório',afterDmh?'Prévia e retorno do DMH':'Prévia da planilha'],
    ['Data de geração',new Date().toLocaleString('pt-BR')],
    ['Total de linhas',details.length],
    ['Prontas na validação',details.filter(row=>row['Validação dos dados']==='PRONTO').length],
    ['Erros de preenchimento',details.filter(row=>row['Validação dos dados']==='ERRO').length],
    ['Ofertas confirmadas no DMH',afterDmh?dmhExportRows.filter(row=>row.resultadoDMH==='OFERTA CONFIRMADA').length:'Ainda não consultado'],
    ['Erros no DMH',afterDmh?dmhExportRows.filter(row=>row.resultadoDMH==='ERRO NO DMH').length:'Ainda não consultado']
  ];
  const workbook=XLSX.utils.book_new();
  const summarySheet=XLSX.utils.aoa_to_sheet(summary);
  const detailSheet=XLSX.utils.json_to_sheet(details);
  const errorSheet=XLSX.utils.json_to_sheet(errors.length?errors:[{'Resultado':'Nenhum erro identificado nesta etapa.'}]);
  summarySheet['!cols']=[{wch:32},{wch:44}];
  [detailSheet,errorSheet].forEach(sheet=>{
    sheet['!autofilter']={ref:sheet['!ref']||'A1:A1'};
    sheet['!freeze']={xSplit:0,ySplit:1};
    sheet['!cols']=Object.keys(details[0]||{}).map(key=>({wch:Math.min(42,Math.max(14,key.length+2))}));
  });
  XLSX.utils.book_append_sheet(workbook,summarySheet,'Resumo');
  XLSX.utils.book_append_sheet(workbook,detailSheet,'Todas as linhas');
  XLSX.utils.book_append_sheet(workbook,errorSheet,'Somente erros');
  const suffix=afterDmh?'com_retorno_dmh':'antes_dmh';
  XLSX.writeFile(workbook,'marketplace_previa_'+suffix+'_'+new Date().toISOString().slice(0,10)+'.xlsx');
}

document.addEventListener('click',event=>{
  if(event.target.closest('#baixarPrevia')) downloadValidationWorkbook('pre');
  if(event.target.closest('#baixarRetornoDMH')){
    if(!dmhExportRows.length) return alert('Consulte as ofertas no DMH antes de baixar o retorno.');
    downloadValidationWorkbook('dmh');
  }
});

let currentBatchToken='';

function saveSubmittedTracking(r,row){
  const id=String(r.created?.id||r.created?.inscricao?.id||r.created?.idOrigem||'');
  if(!id) return;
  const track=r.tracking||{};
  upsertTracking({
    id,cpf:track.cpf||String(row.cpf||''),nome:track.nome||String(row.nome||''),
    canalId:track.canalId||Number(canal.value),canalNome:track.canalNome||channelName(Number(canal.value)),
    curso:track.curso||r.offer?.name||'',businessKeyOferta:track.businessKeyOferta||String(row.businessKeyOferta||''),
    status:String(r.processing?.status||'PROCESSING').toUpperCase(),finished:Boolean(r.processing?.finished),
    quoteReady:Boolean(r.processing?.quoteReady),readyForNextStep:Boolean(r.processing?.readyForNextStep),
    quote:r.processing?.quote||null,errorDetails:r.processing?.errorDetails||null,
    businessOutcome:r.processing?.businessOutcome||null,batchToken:currentBatchToken,
    createdAt:track.createdAt||new Date().toISOString(),checkedAt:new Date().toISOString()
  });
}

function createBatch(totalCount){
  const createdAt=new Date().toISOString();
  const batch={
    id:currentBatchToken,
    createdAt,
    finishedAt:null,
    channelId:Number(canal.value),
    channelName:channelName(Number(canal.value)),
    total:totalCount,
    accepted:0,
    errors:0,
    items:[]
  };
  batchRows.unshift(batch);
  batchRows=batchRows.slice(0,MAX_SAVED_BATCHES);
  persistBatches();
  return batch;
}

function saveBatchItem(batchId,result){
  const batch=batchRows.find(x=>x.id===batchId);
  if(!batch) return;
  batch.items.push(normalizeBatchItem(result,batch));
  batch.accepted=batch.items.filter(x=>x.envioAceito==='Sim').length;
  batch.errors=batch.items.filter(x=>x.envioAceito==='Não').length;
  persistBatches();
}

function finishBatch(batchId,accepted,errors){
  const batch=batchRows.find(x=>x.id===batchId);
  if(!batch) return;
  batch.finishedAt=new Date().toISOString();
  batch.accepted=accepted;
  batch.errors=errors;
  persistBatches();
  renderReports();
}

function normalizeBatchItem(result,batch){
  const r=result.response||{};
  const processing=r.processing||{};
  const created=r.created||{};
  const quote=processing.quote||{};
  const errorDetails=processing.errorDetails||{};
  const outcome=processing.businessOutcome||{};
  const requestError=result.error||null;
  const offerDiagnostic=r.offerDiagnostic||requestError?.offerDiagnostic||null;
  const diagnosticOffer=offerDiagnostic?.offers?.[0]||{};
  return {
    linhaPlanilha:result.index+2,
    dadosOriginais:{...result.row},
    loteId:batch.id,
    dataCarga:batch.createdAt,
    canalId:batch.channelId,
    canalNome:batch.channelName,
    envioAceito:result.ok?'Sim':'Não',
    inscricaoId:String(created.id||created.inscricao?.id||created.idOrigem||''),
    status:String(processing.status||(result.ok?'PROCESSING':'ERROR')).toUpperCase(),
    processamentoFinalizado:Boolean(processing.finished),
    cotacaoGerada:Boolean(processing.quoteReady),
    prontoProximaEtapa:Boolean(processing.readyForNextStep),
    cotacaoReferencia:quote.orderReference||'',
    cotacaoTipo:quote.tipoSimulacao||'',
    cotacaoData:quote.dataGeracao||'',
    erroCodigo:errorDetails.code||outcome.code||requestError?.errorCode||requestError?.status||'',
    erroMensagem:errorSummary(errorDetails)||outcome.frontendMessage||requestError?.message||'',
    erroDetalhe:errorDetails.detail||'',
    diagnosticoOferta:offerDiagnostic?.reason||'',
    fonteOferta:offerDiagnostic?.source||'',
    businessKeyEncontrada:offerDiagnostic?.businessKeyFound===true?'Sim':offerDiagnostic?.businessKeyFound===false?'Não':'',
    canalSolicitadoEncontrado:offerDiagnostic?.requestedChannelFound===true?'Sim':offerDiagnostic?.requestedChannelFound===false?'Não':'',
    canaisEncontrados:Array.isArray(offerDiagnostic?.availableChannels)?offerDiagnostic.availableChannels.join(', '):'',
    idDMH:r.offer?.idDMH||diagnosticOffer.idDMH||'',
    vigenciaInicial:diagnosticOffer.validFrom||'',
    vigenciaFinal:diagnosticOffer.expiredAt||'',
    resultadoNegocio:outcome.type||'',
    inscricaoExistenteId:outcome.existingEnrollmentId||'',
    resultadoVestibular:processing.academicResult?.status||'',
    detalheVestibular:processing.academicResult?.detail||'',
    situacaoCondicao:processing.condition?.status||conditionStatus(processing),
    condicaoAplicada:processing.condition?.applied===true,
    motivoCondicao:processing.condition?.reason||'',
    consultadoEm:r.checkedAt||new Date().toISOString()
  };
}

function loadBatches(){
  try{
    const data=JSON.parse(localStorage.getItem(BATCHES_KEY)||'[]');
    return Array.isArray(data)?data:[];
  }catch{return [];}
}

function persistBatches(){
  try{
    localStorage.setItem(BATCHES_KEY,JSON.stringify(batchRows));
  }catch(error){
    if(batchRows.length>1){
      batchRows.pop();
      persistBatches();
    }else{
      console.warn('Não foi possível salvar o histórico da carga:',error);
    }
  }
}

function updateBatchItemFromStatus(enrollmentId,response){
  const batch=batchRows.find(x=>(x.items||[]).some(item=>String(item.inscricaoId)===String(enrollmentId)));
  const item=batch?.items?.find(x=>String(x.inscricaoId)===String(enrollmentId));
  if(!item) return;
  const processing=response.processing||{};
  const quote=processing.quote||{};
  const errorDetails=processing.errorDetails||{};
  const outcome=processing.businessOutcome||{};
  item.status=String(processing.status||item.status||'PROCESSING').toUpperCase();
  item.processamentoFinalizado=Boolean(processing.finished);
  item.cotacaoGerada=Boolean(processing.quoteReady);
  item.prontoProximaEtapa=Boolean(processing.readyForNextStep);
  item.cotacaoReferencia=quote.orderReference||item.cotacaoReferencia||'';
  item.cotacaoTipo=quote.tipoSimulacao||item.cotacaoTipo||'';
  item.cotacaoData=quote.dataGeracao||item.cotacaoData||'';
  item.erroCodigo=errorDetails.code||outcome.code||item.erroCodigo||'';
  item.erroMensagem=errorSummary(errorDetails)||outcome.frontendMessage||item.erroMensagem||'';
  item.erroDetalhe=errorDetails.detail||item.erroDetalhe||'';
  item.resultadoNegocio=outcome.type||item.resultadoNegocio||'';
  item.inscricaoExistenteId=outcome.existingEnrollmentId||item.inscricaoExistenteId||'';
  item.resultadoVestibular=processing.academicResult?.status||item.resultadoVestibular||'';
  item.detalheVestibular=processing.academicResult?.detail||item.detalheVestibular||'';
  item.situacaoCondicao=processing.condition?.status||conditionStatus(processing)||item.situacaoCondicao||'';
  item.condicaoAplicada=processing.condition?.applied===true||Boolean(item.condicaoAplicada);
  item.motivoCondicao=processing.condition?.reason||item.motivoCondicao||'';
  item.consultadoEm=response.checkedAt||new Date().toISOString();
  persistBatches();
}

function showBatchProgress(title,count){
  currentBatchToken=Date.now()+'-'+Math.random().toString(36).slice(2);
  batchProgress.classList.remove('hidden');
  batchProgressTitle.textContent=title;
  updateBatchProgress(0,count,0,count,0);
}

function updateBatchProgress(processed,count,success,processing,errors){
  const percent=count?Math.round((processed/count)*100):0;
  batchProgressText.textContent=processed+' de '+count+' processadas';
  batchProgressPercent.textContent=percent+'%';
  batchProgressBar.style.width=percent+'%';
  batchTotal.textContent=count;
  batchSuccess.textContent=success;
  batchProcessing.textContent=processing;
  batchErrors.textContent=errors;
}

async function runPool(items,concurrency,worker,onProgress){
  const results=new Array(items.length);
  let next=0,processed=0;
  async function runner(){
    while(true){
      const index=next++;
      if(index>=items.length) return;
      results[index]=await worker(items[index],index);
      processed++;
      onProgress?.(processed,results[index]);
    }
  }
  await Promise.all(Array.from({length:Math.min(concurrency,items.length)},runner));
  return results;
}

async function callApiWithRetry(action,row,key,extra={}){
  let lastError;
  for(let attempt=1;attempt<=3;attempt++){
    try{return await callApi(action,row,key,extra);}
    catch(error){
      lastError=error;
      if(!error.transient||attempt===3) throw error;
      await new Promise(resolve=>setTimeout(resolve,500*Math.pow(2,attempt-1)+Math.random()*250));
    }
  }
  throw lastError;
}

function historyButton(){
  return '<div class="actions"><button class="btn btn-secondary" data-go-history>Acompanhar no Histórico</button></div>';
}

consultarStatus.onclick=async()=>{
  const id=String(statusId.value||'').trim();
  const cpf=String(statusCpf.value||'').trim();
  const key=getOperatorKey();

  if(!key) return alert('Digite a chave de operação.');
  if(!id) return alert('Informe o ID da inscrição.');
  if(!cpf) return alert('Informe também o CPF.');

  await refreshOne(id,cpf,true);
};

atualizarTodos.onclick=async()=>{
  const key=getOperatorKey();
  if(!key) return alert('Digite a chave de operação.');

  const pending=trackingRows.filter(needsStatusRefresh);
  if(!pending.length){
    showStatusMessage('Não há inscrições pendentes para atualizar.');
    return;
  }

  atualizarTodos.disabled=true;
  atualizarTodos.textContent='Atualizando...';

  try{
    await refreshPendingBatch(pending);
    showStatusMessage('Atualização concluída para '+pending.length+' inscrição(ões).');
  }finally{
    atualizarTodos.disabled=false;
    atualizarTodos.textContent='Atualizar pendentes';
  }
};

statusTbody.addEventListener('click',async e=>{
  const btn=e.target.closest('[data-status-id]');
  if(!btn) return;
  const key=getOperatorKey();
  if(!key) return alert('Digite a chave de operação.');

  const id=btn.getAttribute('data-status-id');
  const item=trackingRows.find(x=>String(x.id)===String(id));
  if(!item) return;

  btn.disabled=true;
  btn.textContent='Consultando...';
  try{
    await refreshOne(item.id,item.cpf,true);
  }finally{
    btn.disabled=false;
    btn.textContent='Consultar';
  }
});

async function refreshOne(id,cpf,showMessage){
  try{
    const tracked=trackingRows.find(item=>String(item.id)===String(id))||{};
    const r=await callApi('status',null,getOperatorKey(),{
      enrollmentId:String(id),
      cpf:String(cpf||''),
      businessKeyOferta:String(tracked.businessKeyOferta||''),
      createdAt:String(tracked.createdAt||'')
    });
    applyStatusResponse(String(id),String(cpf||''),r);
    const status=String(r.processing?.status||'PROCESSING').toUpperCase();
    const data=r.processing?.data||null;
    const info=extractInfo(data);
    const quoteReady=Boolean(r.processing?.quoteReady);
    const readyForNextStep=Boolean(r.processing?.readyForNextStep);
    const errorDetails=r.processing?.errorDetails||null;
    const businessOutcome=r.processing?.businessOutcome||null;
    renderTracking();
    renderReports();

    if(showMessage){
      if(isMarketplaceScholarshipApplied({businessOutcome})){
        const linked=businessOutcome?.existingEnrollmentId
          ? ' Inscrição: '+businessOutcome.existingEnrollmentId+'.'
          : ' Não foi possível identificar automaticamente o número da inscrição existente.';
        showStatusMessage((businessOutcome?.frontendMessage||'Bolsa MarketPlace aplicada na inscrição já existente.')+linked);
      }else if(readyForNextStep){
        showStatusMessage('Inscrição '+id+' concluída com SUCCESS e cotação gerada.');
      }else if(status==='SUCCESS'&&!quoteReady){
        showStatusMessage('Inscrição '+id+' está SUCCESS, mas ainda sem cotação.');
      }else if(isFinalStatus(status)){
        const reason=errorSummary(errorDetails);
        showStatusMessage('Inscrição '+id+' finalizada com status '+status+'.'+(reason?' Motivo: '+reason:''),true);
      }else{
        showStatusMessage('Inscrição '+id+' continua em '+status+'.');
      }
    }

    return r;
  }catch(err){
    if(showMessage) showStatusMessage('Não foi possível consultar o ID '+id+': '+err.message,true);
    throw err;
  }
}

function applyStatusResponse(id,cpf,r){
  const processing=r.processing||{};
  const info=extractInfo(processing.data||null);
  upsertTracking({
    id:String(id),cpf:String(cpf||info.cpf||''),nome:info.nome||'',
    canalId:info.canalId||'',canalNome:info.canalNome||'',curso:info.curso||'',
    status:String(processing.status||'PROCESSING').toUpperCase(),
    finished:Boolean(processing.finished),quoteReady:Boolean(processing.quoteReady),
    readyForNextStep:Boolean(processing.readyForNextStep),quote:processing.quote||null,
    resolvedEnrollmentId:String(processing.resolvedEnrollmentId||''),
    reconciledEnrollment:Boolean(processing.reconciledEnrollment),
    errorDetails:processing.errorDetails||null,businessOutcome:processing.businessOutcome||null,
    academicResult:processing.academicResult||null,condition:processing.condition||null,
    checkedAt:r.checkedAt||new Date().toISOString()
  });
  updateBatchItemFromStatus(String(id),r);
}

async function refreshPendingBatch(items){
  if(!items.length) return;
  const response=await callApi('status-batch',null,getOperatorKey(),{
    items:items.slice(0,100).map(item=>({
      enrollmentId:String(item.id),
      cpf:String(item.cpf||''),
      businessKeyOferta:String(item.businessKeyOferta||''),
      createdAt:String(item.createdAt||'')
    }))
  });
  (response.results||[]).forEach(result=>{
    if(result.ok&&result.enrollmentId) applyStatusResponse(result.enrollmentId,result.cpf||'',result);
  });
  renderTracking();
  renderReports();
}

function extractInfo(data){
  if(!data) return {};
  const item=Array.isArray(data)?data[0]:data;
  const ins=item?.inscricao||item||{};
  const dp=item?.dadosPessoais||ins?.dadosPessoais||{};
  const opcao=ins?.ofertas?.primeiraOpcao||{};

  return {
    cpf:dp?.cpf||'',
    nome:dp?.nome||'',
    canalId:ins?.canalVendas?.id||'',
    canalNome:channelName(Number(ins?.canalVendas?.id||0)),
    curso:opcao?.dsCurso||opcao?.name||''
  };
}

function upsertTracking(entry){
  const id=String(entry.id||'').trim();
  if(!id) return;

  const old=trackingRows.find(x=>String(x.id)===id)||{};
  const merged={
    ...old,
    ...Object.fromEntries(Object.entries(entry).filter(([,v])=>v!==''&&v!==null&&v!==undefined)),
    id
  };

  const idx=trackingRows.findIndex(x=>String(x.id)===id);
  if(idx>=0) trackingRows[idx]=merged;
  else trackingRows.unshift(merged);

  trackingRows=trackingRows.slice(0,2000);
  localStorage.setItem(TRACKING_KEY,JSON.stringify(trackingRows));
}

function loadTracking(){
  try{
    const data=JSON.parse(localStorage.getItem(TRACKING_KEY)||'[]');
    return Array.isArray(data)?data:[];
  }catch{
    return [];
  }
}

function renderTracking(){
  const success=trackingRows.filter(x=>String(x.status).toUpperCase()==='SUCCESS'||isMarketplaceScholarshipApplied(x)).length;
  const processing=trackingRows.filter(x=>!isFinalStatus(x.status)).length;
  const noQuote=trackingRows.filter(x=>String(x.status).toUpperCase()==='SUCCESS'&&!x.quoteReady).length;

  histTotal.textContent=trackingRows.length;
  histSuccess.textContent=success;
  histProcessing.textContent=processing;
  histNoQuote.textContent=noQuote;

  if(!trackingRows.length){
    statusTbody.innerHTML='<tr><td colspan="8" class="muted">Nenhuma inscrição acompanhada neste navegador.</td></tr>';
    return;
  }

  statusTbody.innerHTML=trackingRows.map(item=>{
    const status=String(item.status||'PROCESSING').toUpperCase();

    return '<tr>'+
      '<td class="nowrap"><b>'+esc(item.id)+'</b>'+
        (item.resolvedEnrollmentId&&String(item.resolvedEnrollmentId)!==String(item.id)
          ? '<br><span class="muted">Cotação na inscrição '+esc(item.resolvedEnrollmentId)+'</span>'
          : '')+'</td>'+
      '<td class="nowrap">'+esc(item.cpf||'')+'</td>'+
      '<td>'+esc(item.nome||'')+'</td>'+
      '<td>'+esc(item.canalNome||item.canalId||'')+'</td>'+
      '<td>'+esc(item.curso||'')+'</td>'+
      '<td>'+trackingStatusCell(item)+'</td>'+
      '<td class="nowrap">'+esc(formatDateTime(item.checkedAt||item.createdAt))+'</td>'+
      '<td><button class="mini-btn" data-status-id="'+esc(item.id)+'">Consultar</button></td>'+
    '</tr>';
  }).join('');
}

function renderReports(){
  const totalCount=trackingRows.length;
  const successCount=trackingRows.filter(x=>String(x.status).toUpperCase()==='SUCCESS'||isMarketplaceScholarshipApplied(x)).length;
  const processingCount=trackingRows.filter(x=>!isFinalStatus(x.status)).length;
  const quoteCount=trackingRows.filter(x=>x.quoteReady).length;
  const noQuoteCount=trackingRows.filter(x=>String(x.status).toUpperCase()==='SUCCESS'&&!x.quoteReady).length;
  const errorCount=trackingRows.filter(x=>
    ['ERROR','FAILED','FAILURE','CANCELLED','CANCELED','NOT_CONSOLIDATED'].includes(String(x.status).toUpperCase()) &&
    !isMarketplaceScholarshipApplied(x)
  ).length;

  reportTotal.textContent=totalCount;
  reportSuccess.textContent=successCount;
  reportProcessing.textContent=processingCount;
  reportQuote.textContent=quoteCount;
  reportUpdatedAt.textContent='Atualizado em '+new Date().toLocaleString('pt-BR');

  const byChannel={};
  trackingRows.forEach(item=>{
    const name=item.canalNome||channelName(Number(item.canalId))||('Canal '+(item.canalId||'—'));
    if(!byChannel[name]) byChannel[name]={total:0,success:0,processing:0,quote:0};
    byChannel[name].total++;
    if(String(item.status).toUpperCase()==='SUCCESS'||isMarketplaceScholarshipApplied(item)) byChannel[name].success++;
    if(!isFinalStatus(item.status)) byChannel[name].processing++;
    if(item.quoteReady) byChannel[name].quote++;
  });

  const rows=Object.entries(byChannel).sort((a,b)=>b[1].total-a[1].total);
  reportChannelTbody.innerHTML=rows.length
    ? rows.map(([name,v])=>'<tr><td>'+esc(name)+'</td><td>'+v.total+'</td><td>'+v.success+'</td><td>'+v.processing+'</td><td>'+v.quote+'</td></tr>').join('')
    : '<tr><td colspan="5" class="muted">Sem dados para exibir.</td></tr>';

  reportHealth.innerHTML=
    healthItem('Inscrições em processamento',processingCount,processingCount?'warn':'ok')+
    healthItem('SUCCESS sem cotação',noQuoteCount,noQuoteCount?'bad':'ok')+
    healthItem('Erros de processamento',errorCount,errorCount?'bad':'ok')+
    healthItem('Cotações geradas',quoteCount,'ok');

  renderBatchReports();
}

function renderBatchReports(){
  if(!batchRows.length){
    reportBatchTbody.innerHTML='<tr><td colspan="7" class="muted">As próximas cargas enviadas aparecerão aqui para download.</td></tr>';
    return;
  }
  reportBatchTbody.innerHTML=batchRows.map(batch=>
    '<tr>'+
      '<td class="nowrap">'+esc(formatDateTime(batch.createdAt))+'</td>'+
      '<td class="nowrap"><b>'+esc(shortBatchId(batch.id))+'</b></td>'+
      '<td>'+esc(batch.channelName||('Canal '+batch.channelId))+' — '+esc(batch.channelId)+'</td>'+
      '<td>'+Number(batch.total||0)+'</td>'+
      '<td class="ok">'+Number(batch.accepted||0)+'</td>'+
      '<td class="'+(batch.errors?'bad':'')+'">'+Number(batch.errors||0)+'</td>'+
      '<td><button class="mini-btn" data-download-batch="'+esc(batch.id)+'">Baixar Excel</button></td>'+
    '</tr>'
  ).join('');
}

reportBatchTbody.addEventListener('click',event=>{
  const button=event.target.closest('[data-download-batch]');
  if(!button) return;
  const batch=batchRows.find(x=>x.id===button.dataset.downloadBatch);
  if(batch) downloadBatchWorkbook(batch);
});

function downloadBatchWorkbook(batch){
  const rows=(batch.items||[]).sort((a,b)=>a.linhaPlanilha-b.linhaPlanilha).map(item=>({
    'Linha na planilha':item.linhaPlanilha,
    ...item.dadosOriginais,
    'ID do lote':item.loteId,
    'Data da carga':excelDate(item.dataCarga),
    'Canal ID':item.canalId,
    'Canal':item.canalNome,
    'Envio aceito':item.envioAceito,
    'ID da inscrição':item.inscricaoId,
    'Status':item.status,
    'Processamento finalizado':item.processamentoFinalizado?'Sim':'Não',
    'Cotação gerada':item.cotacaoGerada?'Sim':'Não',
    'Pronto para próxima etapa':item.prontoProximaEtapa?'Sim':'Não',
    'Referência da cotação':item.cotacaoReferencia,
    'Tipo da cotação':item.cotacaoTipo,
    'Data da cotação':item.cotacaoData,
    'Código do erro':item.erroCodigo,
    'Mensagem do erro':item.erroMensagem,
    'Detalhe do erro':item.erroDetalhe,
    'Diagnóstico da oferta':item.diagnosticoOferta,
    'Fonte da oferta':item.fonteOferta,
    'Business Key encontrada':item.businessKeyEncontrada,
    'Canal solicitado encontrado':item.canalSolicitadoEncontrado,
    'Canais encontrados no DMH':item.canaisEncontrados,
    'ID DMH':item.idDMH,
    'Vigência inicial':item.vigenciaInicial,
    'Vigência final':item.vigenciaFinal,
    'Resultado de negócio':item.resultadoNegocio,
    'Inscrição existente vinculada':item.inscricaoExistenteId,
    'Resultado do vestibular':item.resultadoVestibular,
    'Detalhe do vestibular':item.detalheVestibular,
    'Situação da condição do canal':item.situacaoCondicao,
    'Condição aplicada':item.condicaoAplicada?'Sim':'Não',
    'Motivo da condição':item.motivoCondicao,
    'Último retorno':excelDate(item.consultadoEm)
  }));

  const summary=[
    ['Relatório da carga',shortBatchId(batch.id)],
    ['Data da carga',excelDate(batch.createdAt)],
    ['Data de conclusão',excelDate(batch.finishedAt)],
    ['Canal',batch.channelName],
    ['Canal ID',batch.channelId],
    ['Total',batch.total],
    ['Envios aceitos',batch.accepted],
    ['Erros no envio',batch.errors],
    ['Cotações geradas',(batch.items||[]).filter(x=>x.cotacaoGerada).length],
    ['Em processamento',(batch.items||[]).filter(x=>!x.processamentoFinalizado&&x.envioAceito==='Sim').length]
  ];

  const workbook=XLSX.utils.book_new();
  const detailSheet=XLSX.utils.json_to_sheet(rows);
  const summarySheet=XLSX.utils.aoa_to_sheet(summary);
  detailSheet['!autofilter']={ref:detailSheet['!ref']||'A1:A1'};
  detailSheet['!freeze']={xSplit:0,ySplit:1};
  detailSheet['!cols']=Object.keys(rows[0]||{'Sem dados':''}).map(key=>({wch:Math.min(45,Math.max(12,key.length+2))}));
  summarySheet['!cols']=[{wch:26},{wch:42}];
  XLSX.utils.book_append_sheet(workbook,summarySheet,'Resumo');
  XLSX.utils.book_append_sheet(workbook,detailSheet,'Inscricoes');
  const date=new Date(batch.createdAt||Date.now()).toISOString().slice(0,10);
  XLSX.writeFile(workbook,'carga_marketplace_canal_'+batch.channelId+'_'+date+'_'+shortBatchId(batch.id)+'.xlsx');
}

function shortBatchId(id){
  return String(id||'').split('-')[0];
}

function excelDate(value){
  return value?formatDateTime(value):'';
}

function isMarketplaceScholarshipApplied(item){
  return item?.businessOutcome?.type==='MARKETPLACE_SCHOLARSHIP_APPLIED_EXISTING';
}

function conditionStatus(processing){
  if(processing?.businessOutcome?.type==='MARKETPLACE_SCHOLARSHIP_APPLIED_EXISTING') return 'APLICADA_INSCRICAO_EXISTENTE';
  if(processing?.quoteReady) return 'COTACAO_GERADA';
  if(processing?.academicResult?.approved===false) return 'NAO_APLICADA_REPROVACAO';
  if(isFinalStatus(processing?.status)) return 'NAO_APLICADA_ERRO_FINAL';
  return 'AGUARDANDO_PROCESSAMENTO';
}

function linkedEnrollmentLine(outcome){
  if(outcome?.existingEnrollmentId){
    return '<b>Inscrição que recebeu a bolsa:</b> '+esc(outcome.existingEnrollmentId);
  }
  if(outcome?.existingEnrollmentAmbiguous && Array.isArray(outcome?.candidateEnrollmentIds) && outcome.candidateEnrollmentIds.length){
    return '<b>Inscrição vinculada:</b> mais de uma inscrição compatível ('+esc(outcome.candidateEnrollmentIds.join(', '))+')';
  }
  return '<b>Inscrição que recebeu a bolsa:</b> não identificada automaticamente';
}

function trackingStatusCell(item){
  if(isMarketplaceScholarshipApplied(item)){
    const outcome=item.businessOutcome||{};
    return '<span class="status-pill status-success">BOLSA APLICADA</span>'+
      '<div class="business-outcome">'+
        esc(outcome.frontendMessage||'Bolsa MarketPlace aplicada na inscrição já existente.')+
        '<br>'+linkedEnrollmentLine(outcome)+
      '</div>';
  }

  const status=String(item?.status||'PROCESSING').toUpperCase();
  const academic=item?.academicResult?.status
    ? '<div class="academic-result"><b>Vestibular:</b> '+esc(item.academicResult.status)+'</div>'
    : '';
  const condition=item?.condition?.status
    ? '<div class="condition-result"><b>Condição:</b> '+esc(item.condition.status.replaceAll('_',' '))+'</div>'
    : '';
  return statusBadge(status)+'<br>'+quoteBadge(item.quoteReady,item.status)+academic+condition+errorReasonCell(item);
}

function errorSummary(details){
  if(!details) return '';
  return String(details.summary||details.message||details.detail||details.code||'').trim();
}

function errorDetailsHtml(details){
  const summary=errorSummary(details);
  if(!summary) return '<br><b>Motivo:</b> não informado pela API.';
  let html='<br><b>Motivo:</b> '+esc(summary);
  if(details?.code && String(details.code)!==summary){
    html+='<br><b>Código:</b> '+esc(details.code);
  }
  if(details?.detail && String(details.detail)!==summary){
    html+='<br><b>Detalhe:</b> '+esc(details.detail);
  }
  return html;
}

function errorReasonCell(item){
  const status=String(item?.status||'').toUpperCase();
  if(!['ERROR','FAILED','FAILURE','CANCELLED','CANCELED','NOT_CONSOLIDATED'].includes(status)) return '';
  const summary=errorSummary(item?.errorDetails);
  const text=summary||'Motivo não informado pela API';
  return '<div class="error-reason" title="'+esc(text)+'"><b>Motivo:</b> '+esc(text)+'</div>';
}

function healthItem(label,value,tone){
  return '<div class="health-item"><span>'+esc(label)+'</span><strong class="health-'+tone+'">'+value+'</strong></div>';
}

function quoteBadge(quoteReady,status){
  const s=String(status||'').toUpperCase();
  if(quoteReady) return '<span class="status-pill status-success">COTAÇÃO GERADA</span>';
  if(s==='SUCCESS') return '<span class="status-pill status-error">SEM COTAÇÃO</span>';
  return '<span class="status-pill status-unknown">COTAÇÃO PENDENTE</span>';
}

function quoteSummary(quote){
  if(!quote||typeof quote!=='object') return '';
  const parts=[];
  if(quote.orderReference) parts.push('Ref.: '+esc(quote.orderReference));
  if(quote.tipoSimulacao) parts.push('Tipo: '+esc(quote.tipoSimulacao));
  if(quote.dataGeracao) parts.push('Gerada em: '+esc(quote.dataGeracao));
  return parts.length?'<br>'+parts.join(' • '):'';
}

function money(v){
  const n=Number(v);
  if(!Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
}

function statusBadge(status){
  const s=String(status||'').toUpperCase();
  let cls='status-unknown';
  if(s==='SUCCESS') cls='status-success';
  else if(['PROCESSING','PENDING','IN_PROCESS','INPROCESS'].includes(s)) cls='status-processing';
  else if(isFinalStatus(s)) cls='status-error';
  return '<span class="status-pill '+cls+'">'+esc(s||'SEM STATUS')+'</span>';
}

function isFinalStatus(status){
  return ['SUCCESS','ERROR','FAILED','FAILURE','CANCELLED','CANCELED'].includes(String(status||'').toUpperCase());
}

function isFinalWithQuote(item){
  if(isMarketplaceScholarshipApplied(item) && item?.businessOutcome?.existingEnrollmentId) return true;
  const status=String(item?.status||'').toUpperCase();
  if(['ERROR','FAILED','FAILURE','CANCELLED','CANCELED','NOT_CONSOLIDATED'].includes(status)) return true;
  return status==='SUCCESS'&&Boolean(item?.quoteReady);
}

function needsStatusRefresh(item){
  const status=String(item?.status||'').toUpperCase();
  const isError=['ERROR','FAILED','FAILURE','CANCELLED','CANCELED','NOT_CONSOLIDATED'].includes(status);
  if(isMarketplaceScholarshipApplied(item) && !item?.businessOutcome?.existingEnrollmentId) return true;
  if(isError && !isMarketplaceScholarshipApplied(item) && !errorSummary(item?.errorDetails)) return true;
  return !isFinalWithQuote(item);
}

function showStatusMessage(message,isError=false){
  statusMessage.textContent=message;
  statusMessage.classList.remove('hidden');
  statusMessage.style.borderColor=isError?'#f2cbc7':'#d8e1ea';
  statusMessage.style.background=isError?'#fff5f4':'#f7f9fc';
  statusMessage.style.color=isError?'#9e2018':'#344054';
}

function channelName(id){
  return channels.find(x=>Number(x[0])===Number(id))?.[1]||'';
}

function formatDateTime(value){
  if(!value) return '';
  const d=new Date(value);
  if(Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('pt-BR');
}

async function callApi(action,row,key,extra={}){
  const body={action,...extra};
  if(row) body.row=row;
  if(action!=='status'&&body.channelId==null) body.channelId=Number(canal.value);

  const res=await fetch(processUrl,{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'x-operator-key':key
    },
    body:JSON.stringify(body)
  });

  const responseText=await res.text();
  let j={};
  try{j=JSON.parse(responseText)}catch{j={error:responseText}}

  if(!res.ok||j.ok===false||j.error){
    const err=new Error(j.error||('HTTP '+res.status));
    err.raw=responseText;
    err.data=j;
    err.status=res.status;
    err.errorCode=j.errorCode||null;
    err.offerDiagnostic=j.offerDiagnostic||null;
    err.transient=[408,425,429,500,502,503,504].includes(res.status);
    throw err;
  }

  return j;
}

function esc(v){
  return String(v??'').replace(/[&<>"']/g,m=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

setInterval(async()=>{
  if(refreshInProgress||!getOperatorKey()) return;
  const pending=trackingRows.filter(needsStatusRefresh);
  if(!pending.length) return;

  refreshInProgress=true;
  try{
    await refreshPendingBatch(pending.slice(0,100));
  }finally{
    refreshInProgress=false;
  }
},AUTO_REFRESH_MS);

window.addEventListener('focus',()=>{
  if(!refreshInProgress&&getOperatorKey()&&trackingRows.some(needsStatusRefresh)){
    refreshInProgress=true;
    refreshPendingBatch(trackingRows.filter(needsStatusRefresh).slice(0,100)).catch(()=>{}).finally(()=>{refreshInProgress=false;});
  }
});
