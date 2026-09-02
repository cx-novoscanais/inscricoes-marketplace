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
const BATCHES_KEY='marketplace_batches_v1';
const MAX_SAVED_BATCHES=8;
const MAX_BATCH_SIZE=500;
const PREVIEW_CONCURRENCY=5;
const SUBMIT_CONCURRENCY=3;
let validRows=[];
let offerApprovedRows=[];
let trackingRows=loadTracking();
let batchRows=loadBatches();
let refreshInProgress=false;

init();

function init(){
  bindNavigation();
  bindKeySync();
  loadChannels();
  renderTracking();
  renderReports();
  canal.addEventListener('change',()=>{
    offerApprovedRows=[];
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
      if(dataRows.length>MAX_BATCH_SIZE){
        throw new Error('A planilha possui '+dataRows.length+' linhas. O limite por carga é '+MAX_BATCH_SIZE+'.');
      }
      validRows=[];
      offerApprovedRows=[];
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
      (rejected.length?'<div class="error offer-list"><b>'+rejected.length+' linha(s) não serão enviadas:</b><br>'+rejected.slice(0,20).map(x=>'Linha '+(x.index+2)+': '+esc(x.error.message)).join('<br>')+(rejected.length>20?'<br>… e mais '+(rejected.length-20):'')+'</div>':'');

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
    const batch=createBatch(count);
    const results=await runPool(offerApprovedRows,SUBMIT_CONCURRENCY,async(row,index)=>{
      try{
        const response=await callApiWithRetry('submit',row,key);
        saveSubmittedTracking(response,row);
        const result={ok:true,row,response,index};
        saveBatchItem(batch.id,result);
        return result;
      }catch(error){
        const result={ok:false,row,error,index};
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
    const failed=results.filter(x=>!x.ok);
    finishBatch(batch.id,succeeded.length,failed.length);
    finalBox.classList.remove('hidden');
    finalResult.innerHTML=
      '<div class="'+(failed.length?'warn':'success')+'"><b>Lote processado.</b><br>'+
      succeeded.length+' inscrição(ões) aceita(s) e '+failed.length+' com falha no envio.'+
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
    erroCodigo:errorDetails.code||outcome.code||requestError?.status||'',
    erroMensagem:errorSummary(errorDetails)||outcome.frontendMessage||requestError?.message||'',
    erroDetalhe:errorDetails.detail||'',
    resultadoNegocio:outcome.type||'',
    inscricaoExistenteId:outcome.existingEnrollmentId||'',
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
    const businessOutcome=r.processing?.businessOutcome||null;

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
      businessOutcome,
      checkedAt:r.checkedAt||new Date().toISOString()
    });
    updateBatchItemFromStatus(String(id),r);

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
      '<td class="nowrap"><b>'+esc(item.id)+'</b></td>'+
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
    ['ERROR','FAILED','FAILURE','CANCELLED','CANCELED'].includes(String(x.status).toUpperCase()) &&
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
    'Resultado de negócio':item.resultadoNegocio,
    'Inscrição existente vinculada':item.inscricaoExistenteId,
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
  return statusBadge(status)+'<br>'+quoteBadge(item.quoteReady,item.status)+errorReasonCell(item);
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
  if(isMarketplaceScholarshipApplied(item) && item?.businessOutcome?.existingEnrollmentId) return true;
  const status=String(item?.status||'').toUpperCase();
  if(['ERROR','FAILED','FAILURE','CANCELLED','CANCELED'].includes(status)) return true;
  return status==='SUCCESS'&&Boolean(item?.quoteReady);
}

function needsStatusRefresh(item){
  const status=String(item?.status||'').toUpperCase();
  const isError=['ERROR','FAILED','FAILURE','CANCELLED','CANCELED'].includes(status);
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
    err.status=res.status;
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
