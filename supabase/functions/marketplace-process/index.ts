import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const TOKEN_URL="https://ingresso-api.kroton.com.br/oauth2/token";
const API_BASE="https://ingresso-api.kroton.com.br";
const DMH_URL="https://elk-backbone-us-prd.es.eastus.azure.elastic-cloud.com:9243/business-offer/_search";
const DMH_FINANCIAL_URL="https://elk-backbone-us-prd.es.eastus.azure.elastic-cloud.com:9243/financial-business-offer/_search";

const CHANNELS={
  94:"Amigo edu - Marketplace",
  95:"Educa mais brasil - Marketplace",
  96:"Vou de bolsa - Marketplace",
  97:"Digdu - Marketplace",
  98:"Quero bolsa - Marketplace",
  99:"Vai de bolsa - Marketplace",
  113:"Edupass - Marketplace",
  114:"Neora - Marketplace",
  120:"Elleve - Marketplace",
  124:"Bolsa mais brasil - Marketplace",
  127:"Casa do Universitario - Marketplace",
  139:"Infinity - Marketplace",
  140:"Galati - Marketplace",
  141:"Inovit - Marketplace",
  146:"Bolsa Convênio Empresa C/ Garantia - Marketplace",
  155:"Unico Skill - Marketplace",
  156:"Pravaler - Marketplace",
  157:"Faca Acontecer (SICOB) - Marketplace",
  158:"Ficou Facil (Santander) - Marketplace",
  159:"Instituto FEPAF - Marketplace",
  160:"Conect Car - Marketplace",
  162:"Omverso - Marketplace"
};

const cors={
  "access-control-allow-origin":"*",
  "access-control-allow-headers":"content-type,x-operator-key",
  "access-control-allow-methods":"GET,POST,OPTIONS"
};
const json=(data,status=200)=>new Response(JSON.stringify(data),{
  status,
  headers:{"content-type":"application/json","cache-control":"no-store",...cors}
});

function txt(v){return String(v??"").trim()}
function optionalEnv(name){return txt(Deno.env.get(name))}
function requiredEnv(name){
  const value=optionalEnv(name);
  if(!value) throw new Error("Configuracao ausente no backend: "+name);
  return value;
}
function toBool(v){
  if(typeof v==="boolean") return v;
  return ["true","1","sim","yes","verdadeiro"].includes(txt(v).toLowerCase());
}
function splitDays(v){
  if(Array.isArray(v)) return v.map(txt).filter(Boolean);
  return txt(v).split(/[|,;]/).map(x=>x.trim()).filter(Boolean);
}

function normalizeDate(v){
  if(v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0,10);
  if(typeof v==="number" && Number.isFinite(v)){
    const epoch=new Date(Date.UTC(1899,11,30));
    epoch.setUTCDate(epoch.getUTCDate()+Math.floor(v));
    return epoch.toISOString().slice(0,10);
  }
  const s=txt(v);
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const br=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if(br) return br[3]+"-"+br[2]+"-"+br[1];
  return s;
}

function normalizeCpfDigits(v){
  let d=txt(v).replace(/\D/g,"");
  if(d.length===10) d="0"+d;
  if(d.length!==11) throw new Error("CPF inválido: informe 10 ou 11 dígitos.");
  return d;
}
function formatCpf(v){
  const d=normalizeCpfDigits(v);
  return d.slice(0,3)+"."+d.slice(3,6)+"."+d.slice(6,9)+"-"+d.slice(9);
}
function formatCep(v){
  const d=txt(v).replace(/\D/g,"");
  if(d.length!==8) return txt(v);
  return d.slice(0,5)+"-"+d.slice(5);
}
function formatCelular(v){
  const d=txt(v).replace(/\D/g,"");
  if(d.length===11) return "("+d.slice(0,2)+")"+d.slice(2,7)+"-"+d.slice(7);
  if(d.length===10) return "("+d.slice(0,2)+")"+d.slice(2,6)+"-"+d.slice(6);
  return txt(v);
}
function credentialSet(){
  return {
    clientId:requiredEnv("INGRESSO_PRD_CLIENT_ID"),
    clientSecret:requiredEnv("INGRESSO_PRD_CLIENT_SECRET"),
    subscriptionKey:requiredEnv("INGRESSO_PRD_SUBSCRIPTION_KEY"),
    profile:"GLOBAL"
  };
}

async function getToken(creds){
  const clientId=String(creds.clientId||"").trim();
  if(!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(clientId)){
    throw new Error("Configuração inválida: INGRESSO_PRD_CLIENT_ID deve ser o client_id de Produção (formato GUID). Revise o Secret no Supabase; não use a chave do DMH nesse campo.");
  }
  const body=new URLSearchParams({
    grant_type:"client_credentials",
    client_id:clientId,
    client_secret:creds.clientSecret
  });
  const r=await fetch(TOKEN_URL,{
    method:"POST",
    headers:{"content-type":"application/x-www-form-urlencoded"},
    body
  });
  const raw=await r.text();
  let data={}; try{data=JSON.parse(raw)}catch{data={raw}}
  if(!r.ok) throw new Error("Token PRD: HTTP "+r.status+" "+raw.slice(0,450));
  const token=data.access_token||data.token||data.id_token;
  if(!token) throw new Error("Token PRD nao encontrado na resposta.");
  return token;
}

class OfferDiagnosticError extends Error {
  constructor(message,diagnostic){
    super(message);
    this.name="OfferDiagnosticError";
    this.diagnostic=diagnostic||null;
  }
}

function dateValue(value){
  const parsed=Date.parse(txt(value));
  return Number.isFinite(parsed)?parsed:null;
}

function channelIdsOf(offer){
  const list=Array.isArray(offer?.salesChannels)?offer.salesChannels:[];
  return [...new Set(list.map(item=>Number(item?.businessKey)).filter(Number.isFinite))].sort((a,b)=>a-b);
}

function offerState(offer,channelId){
  const now=Date.now();
  const validFrom=dateValue(offer?.validFrom);
  const expiredAt=dateValue(offer?.expiredAt);
  const channelLinked=channelIdsOf(offer).includes(Number(channelId));
  const source=txt(offer?.source).toUpperCase();
  const sourceAthenas=source==="ATHENAS";
  const active=offer?.recordActive===true;
  const started=validFrom===null||validFrom<=now;
  const notExpired=expiredAt===null||expiredAt>=now;
  return {
    channelLinked,source:source||null,sourceAthenas,recordActive:active,
    scheduleAvailable:Array.isArray(offer?.scheduleList)&&offer.scheduleList.length>0,
    validFrom:offer?.validFrom||null,expiredAt:offer?.expiredAt||null,started,notExpired,
    eligible:channelLinked&&sourceAthenas&&active&&started&&notExpired
  };
}

function diagnosticReason(records,channelRecords,eligibleRecords){
  if(!records.length) return "BUSINESS_KEY_NOT_FOUND";
  if(!channelRecords.length) return "CHANNEL_NOT_LINKED";
  if(!eligibleRecords.length){
    const states=channelRecords.map(item=>item.state);
    if(states.every(x=>!x.sourceAthenas)) return "SOURCE_NOT_ATHENAS";
    if(states.every(x=>!x.recordActive)) return "OFFER_INACTIVE";
    if(states.every(x=>!x.started)) return "OFFER_NOT_STARTED";
    if(states.every(x=>!x.notExpired)) return "OFFER_EXPIRED";
    return "OFFER_NOT_ELIGIBLE";
  }
  return "OFFER_ELIGIBLE";
}

function diagnosticMessage(diagnostic){
  const channel=diagnostic.requestedChannelId;
  const channels=diagnostic.availableChannels.length
    ? diagnostic.availableChannels.join(", ")
    : "nenhum";

  switch(diagnostic.reason){
    case "BUSINESS_KEY_NOT_FOUND":
      return "Business Key não encontrada no catálogo do DMH.";
    case "CHANNEL_NOT_LINKED":
      return "Business Key encontrada no DMH, porém disponível somente nos canais "+channels+". O canal "+channel+" não está cadastrado para esta oferta.";
    case "SOURCE_NOT_ATHENAS":
      return "A Business Key possui oferta no canal "+channel+", mas a origem não é ATHENAS.";
    case "OFFER_INACTIVE":
      return "A Business Key possui oferta no canal "+channel+", mas está inativa no DMH.";
    case "OFFER_NOT_STARTED":
      return "A Business Key possui oferta no canal "+channel+", mas a vigência ainda não começou.";
    case "OFFER_EXPIRED":
      return "A Business Key possui oferta no canal "+channel+", mas a vigência está encerrada.";
    default:
      return "A Business Key possui oferta no canal "+channel+", mas ela não atende aos critérios de ativação e vigência.";
  }
}

const CATALOG_PAGE_SIZE=5000;
const DMH_SCROLL_URL="https://elk-backbone-us-prd.es.eastus.azure.elastic-cloud.com:9243/_search/scroll";

async function searchCatalogIndex(url,indexLabel,query,options={}){
  const size=Number.isInteger(options.size)?options.size:CATALOG_PAGE_SIZE;
  const requestUrl=options.scroll?url+"?scroll=10m":url;
  const r=await fetch(requestUrl,{
    method:"POST",
    headers:{"content-type":"application/json","authorization":"APIKey "+requiredEnv("DMH_API_KEY_PRD")},
    body:JSON.stringify({size,track_total_hits:true,query,...(options.sort?{sort:options.sort}:{})})
  });
  const raw=await r.text();
  let data={}; try{data=JSON.parse(raw)}catch{data={raw}}
  if(r.status===401) throw new Error(indexLabel+": API Key não autenticada.");
  if(r.status===403) throw new Error(indexLabel+": API Key sem permissão de leitura.");
  if(!r.ok) throw new Error(indexLabel+": HTTP "+r.status+" "+raw.slice(0,500));
  const hits=data?.hits?.hits||[];
  const total=typeof data?.hits?.total==="number"?data.hits.total:(data?.hits?.total?.value??hits.length);
  return {hits,total,scrollId:data?._scroll_id||null};
}

async function searchCatalogScroll(scrollId,indexLabel){
  if(!scrollId) throw new Error("A sessão de paginação do catálogo expirou. Clique em Consultar DMH para reiniciar.");
  const r=await fetch(DMH_SCROLL_URL,{
    method:"POST",
    headers:{"content-type":"application/json","authorization":"APIKey "+requiredEnv("DMH_API_KEY_PRD")},
    body:JSON.stringify({scroll:"10m",scroll_id:scrollId})
  });
  const raw=await r.text();
  let data={}; try{data=JSON.parse(raw)}catch{data={raw}}
  if(r.status===401) throw new Error(indexLabel+": API Key não autenticada.");
  if(r.status===403) throw new Error(indexLabel+": API Key sem permissão de leitura.");
  if(!r.ok) throw new Error(indexLabel+": HTTP "+r.status+" "+raw.slice(0,500));
  const hits=data?.hits?.hits||[];
  const total=typeof data?.hits?.total==="number"?data.hits.total:(data?.hits?.total?.value??hits.length);
  return {hits,total,scrollId:data?._scroll_id||null};
}

async function getFinancialHitsForAcademic(academicHits){
  const ids=[...new Set(academicHits.map(hit=>String(hit?._id||"")).filter(Boolean))];
  if(!ids.length) return [];
  const query={bool:{should:[
    {terms:{"offerSimulationId.keyword":ids}},
    {terms:{offerSimulationId:ids}},
    {ids:{values:ids}}
  ],minimum_should_match:1}};
  const result=await searchCatalogIndex(DMH_FINANCIAL_URL,"Catálogo financeiro DMH",query,{size:10000});
  return result.hits;
}

function catalogPriceFromFinancial(source){
  if(!source||typeof source!=="object")return {catalogPrice:null,catalogPriceSource:null};
  for(const field of ["offerValue","baseValue","subscriptionValue","firstValue","enrollmentValue"]){
    const value=source[field],n=Number(value);
    if(value!==null&&value!==undefined&&value!==""&&Number.isFinite(n)&&n>0)return {catalogPrice:n,catalogPriceSource:field};
  }
  for(const installment of (Array.isArray(source.installments)?source.installments:[])){
    for(const field of ["netValue","grossValue","offerValue","baseValue","value","amount"]){
      const value=installment?.[field],n=Number(value);
      if(value!==null&&value!==undefined&&value!==""&&Number.isFinite(n)&&n>0)return {catalogPrice:n,catalogPriceSource:"installments."+field};
    }
  }
  return {catalogPrice:null,catalogPriceSource:null};
}

function mapCatalogOffers(academicHits,financialHits){
  const financialBySimulation=new Map();
  for(const hit of financialHits){
    const src=hit?._source||{};
    const keys=[txt(src.offerSimulationId),txt(hit?._id)].filter(Boolean);
    for(const key of new Set(keys)){
      if(!financialBySimulation.has(key)) financialBySimulation.set(key,[]);
      financialBySimulation.get(key).push(hit);
    }
  }
  return academicHits.map(hit=>{
    const source=hit?._source||{};
    const idDMH=String(hit?._id||"");
    const financeHits=financialBySimulation.get(idDMH)||[];
    const channels=channelIdsOf(source);
    return {
      idDMH,
      businessKey:txt(source.businessKey),
      name:txt(source.name),
      source:txt(source.source),
      recordActive:source.recordActive===true,
      validFrom:source.validFrom??null,
      expiredAt:source.expiredAt??null,
      channels:channels.map(id=>({id,name:CHANNELS[id]||("Canal "+id)})),
      scheduleList:source.scheduleList??null,
      course:source.course??null,
      modality:source.modality??null,
      unit:source.unit??null,
      turn:source.turn??null,
      paymentOptions:source.paymentOptions??null,
      priceId:source.priceId??null,
      financialOffers:financeHits.map(fin=>({id:String(fin?._id||""),...((fin?._source)||{})})),
      ...catalogPriceFromFinancial(financeHits[0]?._source||null),
      hasFinancialOffer:financeHits.length>0,
      rawAcademic:source
    };
  });
}

async function getOfferCatalog(){
  const now=new Date().toISOString();
  const offerQuery={bool:{filter:[
    {term:{recordActive:true}},
    {range:{validFrom:{lte:"now"}}},
    {range:{expiredAt:{gte:"now"}}}
  ]}};
  const [academic,financialCount]=await Promise.all([
    searchCatalogIndex(DMH_URL,"Catálogo acadêmico DMH",offerQuery,{size:CATALOG_PAGE_SIZE,scroll:true}),
    searchCatalogIndex(DMH_FINANCIAL_URL,"Contagem financeira DMH",{match_all:{}},{size:0})
  ]);
  const financialHits=await getFinancialHitsForAcademic(academic.hits);
  const offers=mapCatalogOffers(academic.hits,financialHits);
  return {
    ok:true,mode:"CATALOG",checkedAt:now,
    filters:{recordActive:true,validFromLte:"now",expiredAtGte:"now"},
    totalAcademic:academic.total,returnedAcademic:offers.length,
    totalFinancial:financialCount.total,returnedFinancial:financialHits.length,
    pageSize:CATALOG_PAGE_SIZE,scrollId:academic.scrollId,
    hasMore:offers.length>0&&offers.length<academic.total,
    truncated:academic.total>offers.length,offers
  };
}

async function getOfferCatalogSearch(body){
  const q=txt(body.q),course=txt(body.course),city=txt(body.city),channelId=txt(body.channelId);
  const pageSize=Math.min(1000,Math.max(100,Number(body.pageSize)||500));
  const filters=[{term:{recordActive:true}},{range:{validFrom:{lte:"now"}}},{range:{expiredAt:{gte:"now"}}}];
  const must=[];
  if(q)must.push({simple_query_string:{query:q,fields:["name^4","businessKey^4","course.*^3","modality.*","unit.*","turn.*","scheduleList.*","salesChannels.businessKey"],default_operator:"and",analyze_wildcard:true}});
  if(course)must.push({simple_query_string:{query:course,fields:["course.*^4","name^2","*course*"],default_operator:"and",analyze_wildcard:true}});
  if(city)must.push({simple_query_string:{query:city,fields:["unit.*","scheduleList.*","*city*","*municip*","*campus*","*location*"],default_operator:"and",analyze_wildcard:true}});
  if(channelId)filters.push({bool:{should:[{term:{"salesChannels.businessKey.keyword":channelId}},{term:{"salesChannels.businessKey":Number(channelId)}}],minimum_should_match:1}});
  const query={bool:{filter:filters,...(must.length?{must}:{})}};
  const result=await searchCatalogIndex(DMH_URL,"Catálogo acadêmico DMH",query,{size:pageSize,scroll:true});
  const financialHits=await getFinancialHitsForAcademic(result.hits);
  const offers=mapCatalogOffers(result.hits,financialHits);
  return {ok:true,mode:"CATALOG_SEARCH",checkedAt:new Date().toISOString(),filters:{q,course,city,channelId:channelId||null,recordActive:true,validFromLte:"now",expiredAtGte:"now"},totalAcademic:result.total,returnedAcademic:offers.length,returnedFinancial:financialHits.length,pageSize,scrollId:result.scrollId,hasMore:offers.length>0&&offers.length<result.total,truncated:result.total>offers.length,offers};
}

async function getOfferCatalogNext(body){
  const page=await searchCatalogScroll(txt(body.scrollId),"Catálogo acadêmico DMH");
  const financialHits=await getFinancialHitsForAcademic(page.hits);
  const offers=mapCatalogOffers(page.hits,financialHits);
  return {
    ok:true,mode:"CATALOG_PAGE",checkedAt:new Date().toISOString(),
    totalAcademic:page.total,returnedAcademic:offers.length,
    returnedFinancial:financialHits.length,pageSize:CATALOG_PAGE_SIZE,
    scrollId:page.scrollId,hasMore:offers.length>0,truncated:offers.length>0,offers
  };
}

async function searchBusinessOffers(query){
  const r=await fetch(DMH_URL,{
    method:"POST",
    headers:{"content-type":"application/json","authorization":"APIKey "+requiredEnv("DMH_API_KEY_PRD")},
    body:JSON.stringify(query)
  });
  const raw=await r.text();
  let data={}; try{data=JSON.parse(raw)}catch{data={raw}}
  if(r.status===401) throw new Error("DMH PRD: API Key não autenticada.");
  if(r.status===403) throw new Error("DMH PRD: API Key autenticada, mas sem permissão de leitura.");
  if(!r.ok) throw new Error("DMH PRD: HTTP "+r.status+" "+raw.slice(0,650));
  return data?.hits?.hits||[];
}

async function findOfferCandidates(businessKey,channelId){
  const normalizedBusinessKey=txt(businessKey).toUpperCase();
  const eligibleQuery={
    size:100,
    query:{bool:{
      must:[
        {term:{"businessKey.keyword":normalizedBusinessKey}},
        {term:{"source.keyword":"ATHENAS"}},
        {term:{"salesChannels.businessKey.keyword":String(channelId)}},
        {range:{expiredAt:{gte:"now"}}},
        {range:{validFrom:{lte:"now"}}},
        {term:{recordActive:true}}
      ],
      adjust_pure_negative:true,
      boost:1.0
    }}
  };
  const eligibleHits=await searchBusinessOffers(eligibleQuery);
  let diagnosticHits=eligibleHits;
  if(!eligibleHits.length){
    diagnosticHits=await searchBusinessOffers({
      size:100,
      query:{bool:{
        must:[
          {term:{"businessKey.keyword":normalizedBusinessKey}},
          {term:{"source.keyword":"ATHENAS"}}
        ],
        adjust_pure_negative:true,
        boost:1.0
      }}
    });
  }
  const records=diagnosticHits.map(hit=>{
    const offer=hit?._source||{};
    return {hit,idDMH:String(hit?._id||""),businessKey:txt(offer.businessKey),name:txt(offer.name),channels:channelIdsOf(offer),state:offerState(offer,channelId)};
  });
  const channelRecords=records.filter(item=>item.state.channelLinked);
  const eligibleIds=new Set(eligibleHits.map(hit=>String(hit?._id||"")));
  const eligibleRecords=records.filter(item=>eligibleIds.has(item.idDMH));
  const availableChannels=[...new Set(records.flatMap(item=>item.channels))].sort((x,y)=>x-y);
  const reason=diagnosticReason(records,channelRecords,eligibleRecords);
  const diagnostic={
    source:"DMH_REALTIME",requiredSource:"ATHENAS",queryValidity:"now/m",
    requestedBusinessKey:normalizedBusinessKey,requestedChannelId:Number(channelId),
    businessKeyFound:records.length>0,requestedChannelFound:channelRecords.length>0,
    eligibleOfferFound:eligibleRecords.length>0,availableChannels,
    channelNames:availableChannels.map(id=>({id,name:CHANNELS[id]||("Canal "+id)})),reason,
    offers:records.slice(0,20).map(item=>({idDMH:item.idDMH,businessKey:item.businessKey,name:item.name,channels:item.channels,...item.state})),
    checkedAt:new Date().toISOString()
  };
  if(!eligibleHits.length) throw new OfferDiagnosticError(diagnosticMessage(diagnostic),diagnostic);
  const result=eligibleHits.map(hit=>({...hit,_offerDiagnostic:diagnostic}));
  result.diagnostic=diagnostic;
  return result;
}

async function findFinancialOffer(idDMH){
  const query={
    size:2,
    query:{
      bool:{
        must:[
          {term:{"_id":String(idDMH)}}
        ]
      }
    }
  };

  const r=await fetch(DMH_FINANCIAL_URL,{
    method:"POST",
    headers:{
      "content-type":"application/json",
      "authorization":"APIKey "+requiredEnv("DMH_API_KEY_PRD")
    },
    body:JSON.stringify(query)
  });

  const raw=await r.text();
  let data={}; try{data=JSON.parse(raw)}catch{data={raw}}

  if(r.status===401) throw new Error("DMH financeiro: API Key não autenticada.");
  if(r.status===403) throw new Error("DMH financeiro: a API Key não possui permissão de leitura no financial-business-offer.");
  if(!r.ok) throw new Error("DMH financeiro: HTTP "+r.status+" "+raw.slice(0,650));

  const hits=data?.hits?.hits||[];
  if(hits.length===0){
    throw new Error("A oferta encontrada não possui oferta financeira correspondente no DMH. Envio bloqueado para evitar inscrição sem preço/cotação.");
  }
  if(hits.length>1){
    throw new Error("O DMH retornou mais de uma oferta financeira para o mesmo idDMH. Envio bloqueado.");
  }

  const financial=hits[0];
  const simulationId=String(financial?._source?.offerSimulationId??financial?._id??"");
  if(simulationId && simulationId!==String(idDMH)){
    throw new Error("A oferta financeira não corresponde ao idDMH acadêmico selecionado. Envio bloqueado.");
  }

  return financial;
}

function numberValue(v){
  const n=Number(v);
  return Number.isFinite(n)?n:0;
}

function fullExemptionScholarship(financialHit){
  const source=financialHit?._source||{};
  const scholarships=Array.isArray(source.scholarships)?source.scholarships:[];

  return scholarships.find(s=>{
    const pct=numberValue(s?.offerValue);
    const calc=txt(s?.calculationType).toUpperCase();
    const untilEnd=s?.untilEndProgram===true;
    const from=numberValue(s?.installmentFrom);
    const to=numberValue(s?.InstallmentTo ?? s?.installmentTo);

    return calc==="P" &&
      pct>=99.99 &&
      untilEnd &&
      from<=1 &&
      to===0;
  }) || null;
}

function installmentsAreFullyExempt(financialHit){
  const installments=financialHit?._source?.installments;
  if(!Array.isArray(installments) || installments.length===0) return false;

  return installments.every(i=>Math.abs(numberValue(i?.netValue))<0.01);
}

async function resolveOfferForChannel(businessKey,channelId){
  const candidates=await findOfferCandidates(businessKey,channelId);
  const offerDiagnostic=candidates.diagnostic||candidates[0]?._offerDiagnostic||null;

  if(Number(channelId)!==155){
    if(candidates.length>1){
      throw new Error("O DMH retornou mais de uma oferta para a mesma Business Key/canal. Envio bloqueado para evitar tabela incorreta.");
    }

    const hit=candidates[0];
    const financialHit=await findFinancialOffer(hit._id);
    return {hit,financialHit,channelRule:null,offerDiagnostic};
  }

  const matches=[];

  for(const hit of candidates){
    let financialHit;
    try{
      financialHit=await findFinancialOffer(hit._id);
    }catch{
      continue;
    }

    const scholarship=fullExemptionScholarship(financialHit);
    const allInstallmentsZero=installmentsAreFullyExempt(financialHit);

    if(scholarship && allInstallmentsZero){
      matches.push({
        hit,
        financialHit,
        scholarship,
        allInstallmentsZero
      });
    }
  }

  if(matches.length===0){
    throw new OfferDiagnosticError(
      "Canal 155 exige bolsa de isenção 100% em todas as parcelas. A Business Key e o canal foram encontrados, mas nenhuma oferta financeira elegível foi localizada no DMH. Envio bloqueado para evitar cobrança indevida.",
      {...offerDiagnostic,reason:"CHANNEL_155_FULL_EXEMPTION_NOT_FOUND",financialRule:{requiredPercentage:100,untilEndProgram:true,allInstallmentsZero:true}}
    );
  }

  if(matches.length>1){
    throw new OfferDiagnosticError(
      "Canal 155 possui mais de uma oferta com isenção 100% no DMH. Envio bloqueado para evitar seleção ambígua da tabela.",
      {...offerDiagnostic,reason:"CHANNEL_155_AMBIGUOUS_FULL_EXEMPTION",eligibleFinancialOffers:matches.map(item=>String(item.hit?._id||""))}
    );
  }

  const selected=matches[0];

  return {
    hit:selected.hit,
    financialHit:selected.financialHit,
    offerResolution:{
      requestedBusinessKey:txt(businessKey),
      resolvedBusinessKey:txt(selected.hit?._source?.businessKey),
      usedEquivalentKey:Boolean(selected.hit?._usedEquivalentKey),
      identityPreserved:true
    },
    offerDiagnostic,
    channelRule:{
      type:"FULL_EXEMPTION_100",
      confirmed:true,
      scholarship:selected.scholarship,
      allInstallmentsZero:true
    }
  };
}

function buildPayload(row,channelId,hit){
  const offer=hit._source||{};
  const combos=Array.isArray(offer.scheduleList)?offer.scheduleList:[];
  const normalizedCombos=combos
    .filter(c=>Array.isArray(c)&&c.length)
    .map(c=>c.map(txt).filter(Boolean))
    .filter(c=>c.length);
  const webCombo=normalizedCombos.find(c=>c.includes("WEB"));
  const days=webCombo||normalizedCombos[0]||[];

  const tipoIngresso="VESTIBULAR";
  const tiposPermitidos=Array.isArray(offer.applicationTypeList)?offer.applicationTypeList.map(x=>txt(x).toUpperCase()):[];
  if(tiposPermitidos.length && !tiposPermitidos.includes(tipoIngresso)){
    throw new Error("Tipo de ingresso "+tipoIngresso+" não está disponível para esta oferta no DMH.");
  }

  const anoConclusao=Number(row.anoConclusao||row.anoConclusaoEnsinoMedio);
  const anoAtual=new Date().getFullYear();
  if(!Number.isInteger(anoConclusao) || anoConclusao<1950 || anoConclusao>anoAtual+1){
    throw new Error("Ano de conclusão do ensino médio inválido. Informe o ano com 4 dígitos.");
  }

  const sexo=txt(row.sexo).toUpperCase();
  if(!["F","M","NI"].includes(sexo)){
    throw new Error("Sexo inválido. Use F, M ou NI.");
  }

  const dataNascimento=normalizeDate(row.dataNascimento);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dataNascimento)){
    throw new Error("Data de nascimento inválida. Use AAAA-MM-DD ou DD/MM/AAAA.");
  }

  const firstOffer={
    idDMH:String(hit._id),
    ...(days.length?{diasDaSemanaSelecionado:days}:{})
  };

  const inscricao={
    aceiteTermo:true,
    aceitaReceberEmail:true,
    aceitaReceberSMS:true,
    aceitaReceberWhatsApp:true,
    enem:{utilizar:false,protocolo:"0"},
    idTipoProva:2,
    anoConclusao,
    canalVendas:{id:Number(channelId)},
    ofertas:{primeiraOpcao:firstOffer},
    tipoIngresso
  };

  if(tipoIngresso==="ENEM"){
    inscricao.enem={utilizar:true,protocolo:"171"};
  }

  return {
    dadosPessoais:{
      cpf:formatCpf(row.cpf),
      nome:txt(row.nome),
      rg:txt(row.rg),
      anoConclusaoEnsinoMedio:anoConclusao,
      sexo,
      celular:formatCelular(row.celular),
      dataNascimento,
      email:txt(row.email),
      endereco:{
        logradouro:txt(row.logradouro),
        numero:txt(row.numero),
        bairro:txt(row.bairro),
        ...(txt(row.complemento)?{complemento:txt(row.complemento)}:{}),
        cep:formatCep(row.cep),
        uf:txt(row.uf).toUpperCase(),
        municipio:txt(row.cidade||row.municipio)
      }
    },
    inscricao
  };
}

async function ingressoFetch(url,token,subscriptionKey,options={}){
  const headers={
    "content-type":"application/json",
    "Ocp-Apim-Subscription-key":subscriptionKey,
    ...(options.headers||{})
  };
  let r=await fetch(url,{...options,headers:{...headers,authorization:token}});
  if(r.status===401){
    r=await fetch(url,{...options,headers:{...headers,authorization:"Bearer "+token}});
  }
  const raw=await r.text();
  let data={}; try{data=JSON.parse(raw)}catch{data={raw}}
  return {r,data,raw};
}

async function createEnrollment(payload,token,creds){
  const result=await ingressoFetch(
    API_BASE+"/ms/inscricaocqrs/captacao/v5/inscricao",
    token,
    creds.subscriptionKey,
    {method:"POST",body:JSON.stringify(payload)}
  );
  if(!result.r.ok) throw new Error("Inscricao V5 PRD: HTTP "+result.r.status+" "+result.raw.slice(0,850));
  return result.data;
}

function extractProcessingStatus(data){
  if(!data) return "";
  if(Array.isArray(data)){
    const item=data[0]||{};
    return txt(item?.inscricao?.processamento?.status||item?.processamento?.status);
  }
  return txt(data?.inscricao?.processamento?.status||data?.processamento?.status);
}

function extractQuote(data){
  if(!data) return null;
  const item=Array.isArray(data)?(data[0]||null):data;
  if(!item) return null;

  const quote=
    item?.matricula?.cotacao ??
    item?.inscricao?.matricula?.cotacao ??
    item?.cotacao ??
    null;

  if(!quote || typeof quote!=="object") return null;
  return Object.keys(quote).length?quote:null;
}

function extractAcademicResult(data){
  const item=firstEnrollment(data);
  if(!item) return {status:null,approved:null,detail:null,source:null};
  const preferred=[
    ["vestibular",item?.inscricao?.vestibular],
    ["prova",item?.inscricao?.prova],
    ["processoSeletivo",item?.inscricao?.processoSeletivo],
    ["resultadoVestibular",item?.inscricao?.resultadoVestibular],
    ["vestibular",item?.vestibular],
    ["prova",item?.prova],
    ["processoSeletivo",item?.processoSeletivo],
    ["resultadoVestibular",item?.resultadoVestibular]
  ];
  let source=null,value=null;
  for(const [name,candidate] of preferred){
    if(candidate!==null && candidate!==undefined && candidate!==""){
      source=name; value=candidate; break;
    }
  }
  if(value===null) return {status:null,approved:null,detail:null,source:null};
  const detail=scalarText(value)||txt(value);
  const normalized=detail.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
  let approved=null;
  if(/REPROV|NAO APROV|INAPTO|ELIMINAD/.test(normalized)) approved=false;
  else if(/APROV|APTO|CLASSIFICAD/.test(normalized)) approved=true;
  const status=approved===true?"APROVADO":approved===false?"REPROVADO":(detail||null);
  return {status,approved,detail:detail||null,source};
}

function conditionResult(status,quoteReady,businessOutcome,academicResult){
  if(businessOutcome?.type==="MARKETPLACE_SCHOLARSHIP_APPLIED_EXISTING"){
    return {status:"APLICADA_INSCRICAO_EXISTENTE",applied:true,reason:businessOutcome.frontendMessage||null};
  }
  if(quoteReady){
    return {status:"COTACAO_GERADA",applied:true,reason:null};
  }
  const upper=txt(status).toUpperCase();
  if(academicResult?.approved===false){
    return {status:"NAO_APLICADA_REPROVACAO",applied:false,reason:"O serviço de inscrições encerrou o processo sem cotação após a reprovação no vestibular."};
  }
  if(["ERROR","FAILED","FAILURE","CANCELLED","CANCELED"].includes(upper)){
    return {status:"NAO_APLICADA_ERRO_FINAL",applied:false,reason:"O serviço de inscrições encerrou o processamento sem gerar cotação."};
  }
  return {status:"AGUARDANDO_PROCESSAMENTO",applied:false,reason:"A API ainda não retornou cotação nem estado final."};
}

function firstEnrollment(data){
  if(!data) return null;
  return Array.isArray(data)?(data[0]||null):data;
}

function processingObject(data){
  const item=firstEnrollment(data);
  if(!item) return null;
  return item?.inscricao?.processamento ?? item?.processamento ?? null;
}

function scalarText(value){
  if(value===null || value===undefined) return "";
  if(typeof value==="string" || typeof value==="number" || typeof value==="boolean"){
    return txt(value);
  }
  if(Array.isArray(value)){
    return value.map(scalarText).filter(Boolean).join(" | ");
  }
  if(typeof value==="object"){
    const preferred=[
      value.mensagem,value.message,value.descricao,value.description,
      value.detalhe,value.detail,value.motivo,value.reason,
      value.codigo,value.code,value.erro,value.error
    ].map(scalarText).filter(Boolean);
    if(preferred.length) return preferred.join(" | ");
  }
  return "";
}

function extractProcessingError(data){
  const item=firstEnrollment(data);
  const proc=processingObject(data);
  const entries=[];

  function add(label,value){
    const text=scalarText(value);
    if(!text) return;
    const normalized=text.replace(/\s+/g," ").trim();
    if(!normalized) return;
    if(entries.some(x=>x.text===normalized)) return;
    entries.push({label,text:normalized});
  }

  function inspect(obj,depth=0){
    if(!obj || depth>4) return;
    if(Array.isArray(obj)){
      obj.forEach(x=>inspect(x,depth+1));
      return;
    }
    if(typeof obj!=="object") return;

    for(const [key,value] of Object.entries(obj)){
      const k=String(key).toLowerCase();
      if(/^(status|data|timestamp|updatedat|createdat)$/.test(k)) continue;

      if(/erro|error|mensag|message|motivo|reason|detalh|detail|descri|description|codigo|code|causa|cause|falha|failure|observa|notification|validat/.test(k)){
        add(key,value);
      }

      if(value && typeof value==="object") inspect(value,depth+1);
    }
  }

  inspect(proc);

  if(item){
    add("erro",item.erro);
    add("error",item.error);
    add("errors",item.errors);
    add("mensagem",item.mensagem);
    add("message",item.message);
    add("detalhe",item.detalhe);
    add("detail",item.detail);
  }

  const codeEntry=entries.find(x=>/codigo|code/i.test(x.label));
  const messageEntry=entries.find(x=>/mensag|message|motivo|reason|descri|description|erro|error|falha|failure/i.test(x.label));
  const detailEntry=entries.find(x=>/detalh|detail|causa|cause|observa|validat|notification/i.test(x.label));

  return {
    hasDetails:entries.length>0,
    code:codeEntry?.text||null,
    message:messageEntry?.text||null,
    detail:detailEntry?.text||null,
    summary:messageEntry?.text||detailEntry?.text||codeEntry?.text||null,
    items:entries.slice(0,12)
  };
}

function errorCorpus(details){
  if(!details) return "";
  return [
    details.code,details.message,details.detail,details.summary,
    ...(Array.isArray(details.items)?details.items.map(x=>x?.text):[])
  ].filter(Boolean).join(" | ");
}

function normalizeMarketplaceOfferBk(value){
  let s=txt(value).toUpperCase();
  if(!s) return "";
  s=s.replace(/^OFFER_/,"");
  s=s.replace(/_TIMESTAMP_.*$/,"");
  s=s.replace(/^SRC_KROTON_/,"");
  if(s.includes("/")) return s;
  return s.replace(/_/g,"/");
}

function extractLinkedMarketplaceBk(details){
  const text=errorCorpus(details);
  const match=text.match(/OFFER_(SRC_KROTON_[A-Z0-9_\/-]+?)(?:_TIMESTAMP_|\s|\||$)/i);
  return match ? normalizeMarketplaceOfferBk(match[1]) : "";
}

function mapBusinessOutcome(details){
  const text=errorCorpus(details);
  const isKe5000=/KE[-_ ]?5000|KE5000/i.test(text);
  const isLinked=/inscri[cç][aã]o inativada ao solicitar oferta do marketplace|BK marketplace vinculada/i.test(text);

  if(isKe5000 && isLinked){
    return {
      type:"MARKETPLACE_SCHOLARSHIP_APPLIED_EXISTING",
      code:"KE-5000",
      frontendMessage:"Bolsa MarketPlace aplicada na inscrição já existente.",
      linkedOfferBusinessKey:extractLinkedMarketplaceBk(details)||null
    };
  }

  return null;
}

function enrollmentOfferBk(item){
  const ins=item?.inscricao||item||{};
  const offer=ins?.ofertas?.primeiraOpcao||{};
  return normalizeMarketplaceOfferBk(offer?.businessKey||"");
}

function enrollmentIsActive(item){
  const ins=item?.inscricao||item||{};
  return ins?.ofertas?.primeiraOpcao?.ativa===true;
}

function enrollmentStatus(item){
  return txt(item?.inscricao?.processamento?.status||item?.processamento?.status).toUpperCase();
}

function enrollmentDateValue(item){
  const ins=item?.inscricao||item||{};
  const raw=ins?.dataInscricao||item?.dataInscricao||"";
  const t=Date.parse(raw);
  return Number.isFinite(t)?t:0;
}

function resolveExistingMarketplaceEnrollment(data,currentId,targetBk){
  const list=Array.isArray(data)?data:(data?[data]:[]);
  let candidates=list.filter(item=>enrollmentIdOf(item)!==String(currentId));

  if(targetBk){
    const target=normalizeMarketplaceOfferBk(targetBk);
    candidates=candidates.filter(item=>enrollmentOfferBk(item)===target);
  }

  if(!candidates.length) return {id:null,ambiguous:false,candidates:[]};

  if(candidates.length===1){
    return {id:enrollmentIdOf(candidates[0]),ambiguous:false,candidates:[enrollmentIdOf(candidates[0])]};
  }

  const active=candidates.filter(enrollmentIsActive);
  if(active.length===1){
    return {id:enrollmentIdOf(active[0]),ambiguous:false,candidates:candidates.map(enrollmentIdOf)};
  }
  if(active.length>1) candidates=active;

  const success=candidates.filter(item=>enrollmentStatus(item)==="SUCCESS");
  if(success.length===1){
    return {id:enrollmentIdOf(success[0]),ambiguous:false,candidates:candidates.map(enrollmentIdOf)};
  }
  if(success.length>1) candidates=success;

  candidates.sort((a,b)=>enrollmentDateValue(b)-enrollmentDateValue(a));

  return {
    id:candidates.length ? enrollmentIdOf(candidates[0]) : null,
    ambiguous:candidates.length>1,
    candidates:candidates.map(enrollmentIdOf)
  };
}

function resolveQuotedEnrollment(data,currentId,targetBk){
  const list=Array.isArray(data)?data:(data?[data]:[]);
  let candidates=list.filter(item=>
    enrollmentIdOf(item)!==String(currentId) && Boolean(extractQuote(item))
  );

  if(!candidates.length) return null;

  if(targetBk){
    const target=normalizeMarketplaceOfferBk(targetBk);
    const exact=candidates.filter(item=>enrollmentOfferBk(item)===target);
    if(exact.length===1) return exact[0];
    if(exact.length>1) candidates=exact;
  }

  if(candidates.length===1) return candidates[0];

  const active=candidates.filter(enrollmentIsActive);
  if(active.length===1) return active[0];
  if(active.length>1) candidates=active;

  const success=candidates.filter(item=>enrollmentStatus(item)==="SUCCESS");
  if(success.length===1) return success[0];

  return null;
}

async function queryById(id,token,creds){
  const url=API_BASE+"/inscricao/query/captacao/v5/buscainscricao/"+encodeURIComponent(id);
  const q=await ingressoFetch(url,token,creds.subscriptionKey,{method:"GET"});
  if(!q.r.ok) return null;
  if(q.data && typeof q.data==="object" && Object.keys(q.data).length===0) return null;
  return q.data;
}

async function queryByCpf(cpf,token,creds){
  if(!cpf) return null;
  const url=API_BASE+"/inscricao/query/captacao/v5/buscainscricao/cpf/"+encodeURIComponent(formatCpf(cpf));
  const q=await ingressoFetch(url,token,creds.subscriptionKey,{method:"GET"});
  if(!q.r.ok) return null;
  return q.data;
}

async function queryLegacyById(id,token,creds){
  const url=API_BASE+"/ms/inscricaocqrs/captacao/v5/inscricao/"+encodeURIComponent(id);
  const q=await ingressoFetch(url,token,creds.subscriptionKey,{method:"GET"});
  if(!q.r.ok) return null;
  if(q.data && typeof q.data==="object" && Object.keys(q.data).length===0) return null;
  return q.data;
}

async function queryLegacyByCpf(cpf,token,creds){
  if(!cpf) return null;
  const url=API_BASE+"/ms/inscricaocqrs/captacao/v5/inscricao/cpf/"+encodeURIComponent(formatCpf(cpf));
  const q=await ingressoFetch(url,token,creds.subscriptionKey,{method:"GET"});
  if(!q.r.ok) return null;
  return q.data;
}

function enrollmentIdOf(item){
  return String(item?.inscricao?.id ?? item?.inscricao?.idOrigem ?? item?.id ?? item?.idOrigem ?? "");
}

function selectEnrollment(data,id){
  if(!data) return null;
  if(Array.isArray(data)){
    return data.find(item=>enrollmentIdOf(item)===String(id)) || null;
  }
  return enrollmentIdOf(data)===String(id) ? data : data;
}

async function getEnrollmentStatus(id,cpf,token,creds,targetBk=""){
  let data=await queryById(id,token,creds);
  let source="ID";

  if(!data && cpf){
    const byCpf=await queryByCpf(cpf,token,creds);
    data=selectEnrollment(byCpf,id);
    source="CPF";
  }

  if(!data){
    data=await queryLegacyById(id,token,creds);
    if(data) source="ID_LEGACY";
  }

  if(!data && cpf){
    const legacyByCpf=await queryLegacyByCpf(cpf,token,creds);
    data=selectEnrollment(legacyByCpf,id);
    if(data) source="CPF_LEGACY";
  }

  if(!data){
    return {
      finished:false,
      status:"NOT_FOUND",
      source:"ALL_QUERIES_EMPTY",
      requestedEnrollmentId:String(id),
      resolvedEnrollmentId:String(id),
      reconciledEnrollment:false,
      quoteReady:false,
      quote:null,
      readyForNextStep:false,
      errorDetails:null,
      businessOutcome:null,
      academicResult:{status:null,approved:null,detail:null,source:null},
      condition:{
        status:"AGUARDANDO_CONSOLIDACAO",
        applied:false,
        reason:"A API devolveu um identificador, mas a inscrição ainda não foi localizada nas consultas oficiais."
      },
      data:null
    };
  }

  let reconciledEnrollment=false;
  let resolvedEnrollmentId=enrollmentIdOf(data)||String(id);

  if(cpf && !extractQuote(data)){
    const currentStatus=(extractProcessingStatus(data)||"PROCESSING").toUpperCase();
    if(["PROCESSING","PENDING","IN_PROCESS","INPROCESS",""].includes(currentStatus)){
      const byCpf=await queryByCpf(cpf,token,creds);
      const quoted=resolveQuotedEnrollment(byCpf,id,targetBk);
      if(quoted){
        data=quoted;
        source="CPF_QUOTED_RECONCILED";
        reconciledEnrollment=true;
        resolvedEnrollmentId=enrollmentIdOf(quoted)||String(id);
      }
    }
  }

  let status=extractProcessingStatus(data)||"PROCESSING";
  let upper=status.toUpperCase();
  let errorDetails=extractProcessingError(data);

  if(["ERROR","FAILED","FAILURE"].includes(upper) && !errorDetails.hasDetails){
    if(cpf){
      const byCpf=await queryByCpf(cpf,token,creds);
      const cpfMatch=selectEnrollment(byCpf,id);
      const cpfDetails=extractProcessingError(cpfMatch);
      if(cpfMatch && cpfDetails.hasDetails){
        data=cpfMatch;
        source="CPF";
        errorDetails=cpfDetails;
        status=extractProcessingStatus(data)||status;
        upper=status.toUpperCase();
      }
    }

    if(!errorDetails.hasDetails){
      const legacyById=await queryLegacyById(id,token,creds);
      const legacyDetails=extractProcessingError(legacyById);
      if(legacyById && legacyDetails.hasDetails){
        data=legacyById;
        source="ID_LEGACY";
        errorDetails=legacyDetails;
        status=extractProcessingStatus(data)||status;
        upper=status.toUpperCase();
      }
    }

    if(!errorDetails.hasDetails && cpf){
      const legacyByCpf=await queryLegacyByCpf(cpf,token,creds);
      const legacyCpfMatch=selectEnrollment(legacyByCpf,id);
      const legacyCpfDetails=extractProcessingError(legacyCpfMatch);
      if(legacyCpfMatch && legacyCpfDetails.hasDetails){
        data=legacyCpfMatch;
        source="CPF_LEGACY";
        errorDetails=legacyCpfDetails;
        status=extractProcessingStatus(data)||status;
        upper=status.toUpperCase();
      }
    }
  }

  const terminalError=["ERROR","FAILED","FAILURE"].includes(upper);
  let businessOutcome=terminalError?mapBusinessOutcome(errorDetails):null;

  if(businessOutcome && cpf){
    const byCpf=await queryByCpf(cpf,token,creds);
    const existing=resolveExistingMarketplaceEnrollment(
      byCpf,
      id,
      businessOutcome.linkedOfferBusinessKey
    );

    businessOutcome={
      ...businessOutcome,
      existingEnrollmentId:existing.id||null,
      existingEnrollmentAmbiguous:Boolean(existing.ambiguous),
      candidateEnrollmentIds:existing.candidates||[]
    };
  }

  const quote=extractQuote(data);
  const quoteReady=Boolean(quote);
  const academicResult=extractAcademicResult(data);
  const finished=upper==="SUCCESS"||terminalError;
  const readyForNextStep=upper==="SUCCESS"&&quoteReady;
  const condition=conditionResult(status,quoteReady,businessOutcome,academicResult);

  return {
    finished,
    status,
    source,
    requestedEnrollmentId:String(id),
    resolvedEnrollmentId,
    reconciledEnrollment,
    quoteReady,
    quote:quote||null,
    readyForNextStep,
    errorDetails:terminalError?errorDetails:null,
    businessOutcome,
    academicResult,
    condition,
    data:data||null
  };
}

function finalizeMissingEnrollment(processing,createdAt=""){
  if(processing?.status!=="NOT_FOUND") return processing;

  const createdMs=Date.parse(txt(createdAt));
  const withinGrace=Number.isFinite(createdMs) && Date.now()-createdMs<120000;

  if(withinGrace){
    return {
      ...processing,
      status:"PROCESSING",
      condition:{
        status:"AGUARDANDO_CONSOLIDACAO",
        applied:false,
        reason:"A inscrição ainda está dentro do prazo inicial de consolidação da API."
      }
    };
  }

  return {
    ...processing,
    finished:true,
    status:"NOT_CONSOLIDATED",
    errorDetails:{
      hasDetails:true,
      code:"ENROLLMENT_NOT_CONSOLIDATED",
      message:"Inscrição não consolidada na base oficial.",
      detail:"A API de criação devolveu um ID, mas o registro não foi encontrado por ID nem por CPF nas consultas V5 e legadas.",
      summary:"Inscrição não consolidada na base oficial.",
      items:[]
    },
    condition:{
      status:"INSCRICAO_NAO_CONSOLIDADA",
      applied:false,
      reason:"A inscrição não existe na base oficial; por isso não houve cotação nem aplicação da bolsa."
    }
  };
}

async function runLimited(items,limit,worker){
  const results=new Array(items.length);
  let next=0;
  async function runner(){
    while(true){
      const index=next++;
      if(index>=items.length) return;
      try{results[index]={ok:true,...await worker(items[index])}}
      catch(error){results[index]={ok:false,enrollmentId:txt(items[index]?.enrollmentId||items[index]?.id),cpf:txt(items[index]?.cpf),error:error?.message||String(error)}}
    }
  }
  await Promise.all(Array.from({length:Math.min(limit,items.length)},runner));
  return results;
}

async function pollStatus(id,cpf,token,creds,targetBk=""){
  let last={
    finished:false,
    status:"PROCESSING",
    source:"ID",
    quoteReady:false,
    quote:null,
    readyForNextStep:false,
    data:null
  };

  for(let attempt=1;attempt<=10;attempt++){
    if(attempt>1) await new Promise(resolve=>setTimeout(resolve,2000));
    last=await getEnrollmentStatus(id,cpf,token,creds,targetBk);

    const upper=String(last.status||"").toUpperCase();
    const terminalError=["ERROR","FAILED","FAILURE"].includes(upper);

    if(last.readyForNextStep || terminalError){
      return {...last,attempts:attempt};
    }
  }

  return {...last,attempts:10};
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS") return new Response("",{headers:cors});
  if(req.method==="GET"){
    return json({
      ok:true,
      service:"marketplace-process",
      environment:"PRD",
      channels:Object.entries(CHANNELS).map(([id,name])=>({id:Number(id),name})),
      credentialStrategy:"single_api_credentials_dynamic_channel",
      offerSource:"DMH_REALTIME",
      offerResolution:"EXACT_BUSINESS_KEY_ATHENAS_CHANNEL_VALIDITY",
      dmhQueryRules:{source:"ATHENAS",validFrom:"lte now/m",expiredAt:"gte now/m",recordActive:true,scheduleListRequired:false},
      spreadsheetModel:"SIMPLIFIED_16_COLUMNS",
      automaticEnrollmentFields:["turno","diasDaSemanaSelecionado","tipoIngresso","aceiteTermo","aceiteEmail","aceiteSMS","aceiteWhatsApp"],
      release:"2026-10-20-offer-catalog-api"
    });
  }
  if(req.method!=="POST") return json({error:"Metodo nao permitido."},405);

  try{
    if(req.headers.get("x-operator-key")!==requiredEnv("MARKETPLACE_OPERATOR_KEY")){
      return json({error:"Chave de operacao invalida."},401);
    }

    const body=await req.json();
    if(body.action==="catalog"){
      return json(await getOfferCatalog());
    }
    if(body.action==="catalog-search"){
      return json(await getOfferCatalogSearch(body));
    }
    if(body.action==="catalog-next"){
      return json(await getOfferCatalogNext(body));
    }
    const row=body.row||{};
    const channelId=Number(body.channelId);

    const creds=credentialSet();

    if(body.action==="status"){
      const enrollmentId=txt(body.enrollmentId||body.id);
      const cpf=body.cpf?formatCpf(body.cpf):"";
      if(!enrollmentId) return json({error:"ID da inscrição é obrigatório para consultar o status."},400);

      const token=await getToken(creds);
      const rawTracking=await getEnrollmentStatus(enrollmentId,cpf,token,creds,txt(body.businessKeyOferta));
      const tracking=finalizeMissingEnrollment(rawTracking,body.createdAt);

      return json({
        ok:true,
        mode:"STATUS",
        enrollmentId,
        cpf:cpf||null,
        processing:tracking,
        checkedAt:new Date().toISOString()
      });
    }

    if(body.action==="status-batch"){
      const items=Array.isArray(body.items)?body.items.slice(0,100):[];
      if(!items.length) return json({error:"Informe ao menos uma inscrição para consulta."},400);
      const token=await getToken(creds);
      const results=await runLimited(items,5,async item=>{
        const enrollmentId=txt(item?.enrollmentId||item?.id);
        const cpf=item?.cpf?formatCpf(item.cpf):"";
        if(!enrollmentId) throw new Error("ID da inscrição não informado.");
        const rawProcessing=await getEnrollmentStatus(enrollmentId,cpf,token,creds,txt(item?.businessKeyOferta));
        const processing=finalizeMissingEnrollment(rawProcessing,item?.createdAt);
        return {enrollmentId,cpf:cpf||null,processing,checkedAt:new Date().toISOString()};
      });
      return json({ok:true,mode:"STATUS_BATCH",results,checkedAt:new Date().toISOString()});
    }

    if(!CHANNELS[channelId]) return json({error:"Canal Marketplace nao cadastrado: "+channelId},400);
    if(!txt(row.businessKeyOferta)) return json({error:"businessKeyOferta e obrigatoria."},400);

    const resolved=await resolveOfferForChannel(txt(row.businessKeyOferta),channelId);
    const hit=resolved.hit;
    const financialHit=resolved.financialHit;
    const channelRule=resolved.channelRule;
    const offerDiagnostic=resolved.offerDiagnostic||null;
    const offerResolution=resolved.offerResolution||{
      requestedBusinessKey:txt(row.businessKeyOferta),
      resolvedBusinessKey:txt(hit?._source?.businessKey),
      usedEquivalentKey:false,
      identityPreserved:true
    };
    const payload=buildPayload(row,channelId,hit);

    if(body.action==="preview"){
      return json({
        ok:true,
        mode:"PREVIEW",
        channel:{id:channelId,name:CHANNELS[channelId]},
        credentialProfile:creds.profile,
        offer:{
          idDMH:hit._id,
          name:hit._source?.name,
          businessKey:hit._source?.businessKey,
          resolution:offerResolution,
          scheduleList:hit._source?.scheduleList,
          automaticFields:{
            turno:"DEFINIDO_PELA_OFERTA_DMH",
            diasDaSemanaSelecionado:payload?.inscricao?.ofertas?.primeiraOpcao?.diasDaSemanaSelecionado||[],
            tipoIngresso:"VESTIBULAR",
            aceiteTermo:true,
            aceitaReceberEmail:true,
            aceitaReceberSMS:true,
            aceitaReceberWhatsApp:true
          },
          salesChannels:hit._source?.salesChannels,
          paymentOptions:hit._source?.paymentOptions,
          priceId:hit._source?.priceId,
          financial:{
            id:financialHit?._id,
            offerSimulationId:financialHit?._source?.offerSimulationId,
            subscriptionValue:financialHit?._source?.subscriptionValue,
            enrollmentValue:financialHit?._source?.enrollmentValue,
            baseValue:financialHit?._source?.baseValue,
            offerValue:financialHit?._source?.offerValue,
            firstValue:financialHit?._source?.firstValue,
            installments:financialHit?._source?.installments
          }
        },
        offerDiagnostic,
        priceValidation:{
          source:"DMH_REALTIME",
          checkedAt:new Date().toISOString(),
          channelConfirmed:true,
          financialOfferConfirmed:true,
          idDMH:String(hit._id),
          channelId,
          channel155FullExemption: Number(channelId)===155 ? {
            required:true,
            confirmed:Boolean(channelRule?.confirmed),
            scholarshipCode:channelRule?.scholarship?.code||null,
            scholarshipDescription:channelRule?.scholarship?.description||null,
            percentage:numberValue(channelRule?.scholarship?.offerValue),
            untilEndProgram:Boolean(channelRule?.scholarship?.untilEndProgram),
            installmentFrom:numberValue(channelRule?.scholarship?.installmentFrom),
            installmentTo:numberValue(channelRule?.scholarship?.InstallmentTo ?? channelRule?.scholarship?.installmentTo),
            allInstallmentsZero:Boolean(channelRule?.allInstallmentsZero)
          } : null
        },
        payload
      });
    }

    if(body.action!=="submit") return json({error:"Acao invalida."},400);

    const token=await getToken(creds);
    const created=await createEnrollment(payload,token,creds);
    const id=created?.id||created?.inscricao?.id||created?.idOrigem;
    if(!id) throw new Error("API aceitou a requisicao, mas nao retornou identificador da inscricao.");

    const processing=await pollStatus(id,row.cpf,token,creds,txt(row.businessKeyOferta));

    return json({
      ok:true,
      mode:"PRD",
      channel:{id:channelId,name:CHANNELS[channelId]},
      credentialProfile:creds.profile,
      offer:{
        idDMH:hit._id,
        name:hit._source?.name,
        paymentOptions:hit._source?.paymentOptions,
        financialOfferId:financialHit?._id,
        resolution:offerResolution
      },
      offerDiagnostic,
      pricingRule: Number(channelId)===155 ? {
        fullExemption100Confirmed:Boolean(channelRule?.confirmed),
        scholarshipCode:channelRule?.scholarship?.code||null,
        scholarshipDescription:channelRule?.scholarship?.description||null,
        percentage:numberValue(channelRule?.scholarship?.offerValue),
        allInstallmentsZero:Boolean(channelRule?.allInstallmentsZero)
      } : null,
      created,
      acceptedForProcessing:true,
      businessConfirmed:Boolean(processing?.readyForNextStep||processing?.businessOutcome?.type==="MARKETPLACE_SCHOLARSHIP_APPLIED"),
      processing,
      tracking:{
        id:String(id),
        cpf:formatCpf(row.cpf),
        nome:txt(row.nome),
        canalId:channelId,
        canalNome:CHANNELS[channelId],
        curso:hit._source?.name||"",
        businessKeyOferta:txt(row.businessKeyOferta),
        createdAt:new Date().toISOString()
      }
    });
  }catch(error){
    const diagnostic=error?.diagnostic||null;
    const status=diagnostic?422:500;
    return json({
      ok:false,
      error:error?.message||String(error),
      errorCode:diagnostic?.reason||null,
      offerDiagnostic:diagnostic,
      checkedAt:new Date().toISOString()
    },status);
  }
});