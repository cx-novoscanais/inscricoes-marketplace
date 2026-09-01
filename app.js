const processUrl='https://oklzhsljbqjfpxmgpcfz.supabase.co/functions/v1/marketplace-process';
const $=id=>document.getElementById(id);

const canal=$('canal');
const arquivo=$('arquivo');
const opkey=$('opkey');
const opkeyHistory=$('opkeyHistory');
const validar=$('validar');
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

const required=[
'cpf','nome','rg','anoConclusaoEnsinoMedio','sexo','celular','dataNascimento','email',
'logradouro','numero','cep','uf','municipio','businessKeyOferta','tipoIngresso',
'aceiteTermo','aceitaReceberEmail','aceitaReceberSMS','aceitaReceberWhatsApp'
];

const TRACKING_KEY='marketplace_tracking_v2';
let validRows=[];
let trackingRows=loadTracking();
let refreshInProgress=false;

init();

function init(){
  bindNavigation();
  bindKeySync();
  loadChannels();
  renderTracking();
  renderReports();
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
    relatorios:$('viewRelatorios')
  };

  Object.entries(map).forEach(([name,el])=>el?.classList.toggle('active',name===view));
  document.querySelectorAll('[data-view]').forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.view===view);
  });

  if(view==='historico') renderTracking();
  if(view==='relatorios') renderReports();
  window.scrollTo({top:0,behavior:'smooth'});
}

function bindKeySync(){
  const sync=(from,to)=>()=>{
    if(to && from.value!==to.value) to.value=from.value;
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

validar.onclick=()=>{
  if(!arquivo.files[0]) return alert('Selecione uma planilha.');
  const rd=new FileReader();

  rd.onload=e=>{
    try{
      const wb=XLSX.read(new Uint8Array(e.target.result),{type:'array'});
      const ws=wb.Sheets['MODELO_GRADUACAO']||wb.Sheets[wb.SheetNames[0]];
      const dataRows=XLSX.utils.sheet_to_json(ws,{defval:''});
      validRows=[];
      let bad=0;

      tbody.innerHTML=dataRows.map((r,i)=>{
        const miss=required.filter(k=>String(r[k]??'').trim()==='');
        const good=miss.length===0;
        if(good) validRows.push(r); else bad++;

        return '<tr>'+
          '<td>'+(i+2)+'</td>'+
          '<td>'+esc(r.cpf)+'</td>'+
          '<td>'+esc(r.nome)+'</td>'+
          '<td>'+esc(r.businessKeyOferta)+'</td>'+
          '<td>'+esc(r.diasDaSemanaSelecionado||'')+'</td>'+
          '<td class="'+(good?'ok':'bad')+'">'+(good?'PRONTO':'ERRO')+'</td>'+
          '<td>'+miss.map(x=>'Falta: '+esc(x)).join('<br>')+'</td>'+
        '</tr>';
      }).join('');

      total.textContent=dataRows.length;
      prontos.textContent=validRows.length;
      erros.textContent=bad;
      resumo.classList.remove('hidden');
      oferta.disabled=validRows.length!==1;
      dmhBox.classList.add('hidden');
      finalBox.classList.add('hidden');
      enviar.disabled=false;
      enviar.textContent='Descer inscrição em Produção';

      if(validRows.length===1&&!statusCpf.value){
        statusCpf.value=String(validRows[0].cpf||'');
      }

      if(validRows.length>1){
        alert('Para o primeiro teste, deixe somente 1 linha preenchida na planilha.');
      }
    }catch(err){
      alert('Erro ao ler a planilha: '+err.message);
    }
  };

  rd.readAsArrayBuffer(arquivo.files[0]);
};

oferta.onclick=async()=>{
  if(validRows.length!==1) return;
  const key=getOperatorKey();
  if(!key) return alert('Digite a chave de operação.');

  oferta.disabled=true;
  oferta.textContent='Consultando DMH...';

  try{
    const r=await callApi('preview',validRows[0],key);
    const p=r.offer?.paymentOptions||{};
    const f=r.offer?.financial||{};
    const is155=Number(r.channel?.id||canal.value)===155;
    const exemption=r.priceValidation?.channel155FullExemption;

    dmhResult.innerHTML=
      '<div class="offer-summary">'+
        '<div><span>Curso</span><strong>'+esc(r.offer?.name||'')+'</strong></div>'+
        '<div><span>Canal</span><strong>'+esc((r.channel?.name||'')+' — '+String(r.channel?.id||canal.value))+'</strong></div>'+
        '<div><span>idDMH</span><strong>'+esc(r.offer?.idDMH||'')+'</strong></div>'+
        '<div><span>Oferta financeira</span><strong>'+esc(f.id||'Confirmada')+'</strong></div>'+
      '</div>'+
      '<div class="offer-summary">'+
        '<div><span>Preço base</span><strong>'+money(p.baseValue??f.baseValue)+'</strong></div>'+
        '<div><span>Preço da oferta</span><strong>'+money(p.offerValue??f.offerValue)+'</strong></div>'+
        '<div><span>Valor de matrícula</span><strong>'+money(p.enrollmentValue??f.enrollmentValue)+'</strong></div>'+
        '<div><span>Agenda</span><strong>'+esc(JSON.stringify(r.offer?.scheduleList||[]))+'</strong></div>'+
      '</div>'+
      (is155
        ? '<div class="validation-box"><b>Regra financeira do canal 155 validada.</b> Bolsa de isenção de 100%, válida até o fim do curso, com todas as parcelas isentas.'+
          (exemption?.scholarshipDescription?' Bolsa DMH: '+esc(exemption.scholarshipDescription)+'.':'')+
          '</div>'
        : '<div class="validation-box"><b>Tabela do canal confirmada.</b> O canal selecionado está vinculado ao idDMH e a oferta financeira correspondente foi localizada.</div>');

    dmhBox.classList.remove('hidden');
    enviar.disabled=false;
    enviar.textContent='Descer inscrição em Produção';
  }catch(err){
    alert(err.message);
  }finally{
    oferta.disabled=false;
    oferta.textContent='Consultar oferta no DMH';
  }
};

enviar.onclick=async()=>{
  const key=getOperatorKey();
  if(!key) return alert('Digite a chave de operação.');
  if(validRows.length!==1) return alert('Valide uma única inscrição antes de enviar.');
  if(!confirm('CONFIRMA a criação de 1 inscrição REAL em PRODUÇÃO no canal selecionado?')) return;

  let accepted=false;
  enviar.disabled=true;
  enviar.textContent='Enviando inscrição...';

  try{
    const r=await callApi('submit',validRows[0],key);
    finalBox.classList.remove('hidden');

    const id=String(r.created?.id||r.created?.inscricao?.id||r.created?.idOrigem||'');
    const status=String(r.processing?.status||'PROCESSING').toUpperCase();
    const finished=Boolean(r.processing?.finished);
    const quoteReady=Boolean(r.processing?.quoteReady);
    const readyForNextStep=Boolean(r.processing?.readyForNextStep);
    const errorDetails=r.processing?.errorDetails||null;
    accepted=Boolean(id);

    if(id){
      const track=r.tracking||{};
      upsertTracking({
        id,
        cpf:track.cpf||String(validRows[0].cpf||''),
        nome:track.nome||String(validRows[0].nome||''),
        canalId:track.canalId||Number(canal.value),
        canalNome:track.canalNome||channelName(Number(canal.value)),
        curso:track.curso||r.offer?.name||'',
        businessKeyOferta:track.businessKeyOferta||String(validRows[0].businessKeyOferta||''),
        status,
        finished,
        quoteReady,
        readyForNextStep,
        quote:r.processing?.quote||null,
        errorDetails,
        createdAt:track.createdAt||new Date().toISOString(),
        checkedAt:new Date().toISOString()
      });

      statusId.value=id;
      statusCpf.value=track.cpf||String(validRows[0].cpf||'');
    }

    if(readyForNextStep){
      finalResult.innerHTML=
        '<div class="success"><b>Inscrição concluída e cotação gerada.</b><br>'+
        'ID: '+esc(id)+' • Status: SUCCESS'+quoteSummary(r.processing?.quote)+'</div>'+
        historyButton();
    }else if(status==='SUCCESS'&&!quoteReady){
      finalResult.innerHTML=
        '<div class="warn"><b>Inscrição concluída, mas a cotação ainda não apareceu.</b><br>'+
        'ID: '+esc(id)+'. Acompanhe no Histórico antes de seguir para a próxima etapa.</div>'+
        historyButton();
    }else if(finished){
      finalResult.innerHTML=
        '<div class="error"><b>A inscrição foi recebida, mas o processamento terminou com erro.</b><br>'+
        'ID: '+esc(id)+' • Status: '+esc(status)+
        errorDetailsHtml(errorDetails)+
        '</div>'+
        historyButton();
    }else{
      finalResult.innerHTML=
        '<div class="warn"><b>Inscrição enviada e em processamento.</b><br>'+
        'ID: '+esc(id)+'. Não envie novamente; acompanhe a evolução pelo Histórico.</div>'+
        historyButton();
    }

    raw.textContent=JSON.stringify(r,null,2);
    renderTracking();
    renderReports();
  }catch(err){
    finalBox.classList.remove('hidden');
    finalResult.innerHTML='<div class="error"><b>Falha:</b> '+esc(err.message)+'</div>';
    raw.textContent=err.raw||'';
  }finally{
    if(accepted){
      enviar.disabled=true;
      enviar.textContent='Inscrição enviada';
    }else{
      enviar.disabled=false;
      enviar.textContent='Descer inscrição em Produção';
    }
  }
};

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
    for(const item of pending) await refreshOne(item.id,item.cpf,false);
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
    const r=await callApi('status',null,getOperatorKey(),{enrollmentId:String(id),cpf:String(cpf||'')});
    const status=String(r.processing?.status||'PROCESSING').toUpperCase();
    const data=r.processing?.data||null;
    const info=extractInfo(data);
    const quoteReady=Boolean(r.processing?.quoteReady);
    const readyForNextStep=Boolean(r.processing?.readyForNextStep);
    const errorDetails=r.processing?.errorDetails||null;

    upsertTracking({
      id:String(id),
      cpf:String(cpf||info.cpf||''),
      nome:info.nome||'',
      canalId:info.canalId||'',
      canalNome:info.canalNome||'',
      curso:info.curso||'',
      status,
      finished:Boolean(r.processing?.finished),
      quoteReady,
      readyForNextStep,
      quote:r.processing?.quote||null,
      errorDetails,
      checkedAt:r.checkedAt||new Date().toISOString()
    });

    renderTracking();
    renderReports();

    if(showMessage){
      if(readyForNextStep){
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

  trackingRows=trackingRows.slice(0,100);
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
  const success=trackingRows.filter(x=>String(x.status).toUpperCase()==='SUCCESS').length;
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
      '<td class="nowrap"><b>'+esc(item.id)+'</b></td>'+
      '<td class="nowrap">'+esc(item.cpf||'')+'</td>'+
      '<td>'+esc(item.nome||'')+'</td>'+
      '<td>'+esc(item.canalNome||item.canalId||'')+'</td>'+
      '<td>'+esc(item.curso||'')+'</td>'+
      '<td>'+statusBadge(status)+'<br>'+quoteBadge(item.quoteReady,item.status)+errorReasonCell(item)+'</td>'+
      '<td class="nowrap">'+esc(formatDateTime(item.checkedAt||item.createdAt))+'</td>'+
      '<td><button class="mini-btn" data-status-id="'+esc(item.id)+'">Consultar</button></td>'+
    '</tr>';
  }).join('');
}

function renderReports(){
  const totalCount=trackingRows.length;
  const successCount=trackingRows.filter(x=>String(x.status).toUpperCase()==='SUCCESS').length;
  const processingCount=trackingRows.filter(x=>!isFinalStatus(x.status)).length;
  const quoteCount=trackingRows.filter(x=>x.quoteReady).length;
  const noQuoteCount=trackingRows.filter(x=>String(x.status).toUpperCase()==='SUCCESS'&&!x.quoteReady).length;
  const errorCount=trackingRows.filter(x=>['ERROR','FAILED','FAILURE','CANCELLED','CANCELED'].includes(String(x.status).toUpperCase())).length;

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
    if(String(item.status).toUpperCase()==='SUCCESS') byChannel[name].success++;
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
  if(!['ERROR','FAILED','FAILURE','CANCELLED','CANCELED'].includes(status)) return '';
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
  const status=String(item?.status||'').toUpperCase();
  if(['ERROR','FAILED','FAILURE','CANCELLED','CANCELED'].includes(status)) return true;
  return status==='SUCCESS'&&Boolean(item?.quoteReady);
}

function needsStatusRefresh(item){
  const status=String(item?.status||'').toUpperCase();
  const isError=['ERROR','FAILED','FAILURE','CANCELLED','CANCELED'].includes(status);
  if(isError && !errorSummary(item?.errorDetails)) return true;
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
  if(action!=='status') body.channelId=Number(canal.value);

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
  if(document.visibilityState!=='visible'||refreshInProgress||!getOperatorKey()) return;
  const pending=trackingRows.filter(needsStatusRefresh);
  if(!pending.length) return;

  refreshInProgress=true;
  try{
    for(const item of pending.slice(0,10)){
      try{await refreshOne(item.id,item.cpf,false)}catch{}
    }
  }finally{
    refreshInProgress=false;
  }
},30000);