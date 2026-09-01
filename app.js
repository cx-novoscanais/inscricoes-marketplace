const processUrl='https://oklzhsljbqjfpxmgpcfz.supabase.co/functions/v1/marketplace-process';
const channels=[
[99,'Vai de bolsa - Marketplace'],[97,'Digdu - Marketplace'],[96,'Vou de bolsa - Marketplace'],
[94,'Amigo edu - Marketplace'],[98,'Quero bolsa - Marketplace'],[95,'Educa mais brasil - Marketplace'],
[127,'Casa do Universitário - Marketplace'],[113,'Edupass - Marketplace'],[114,'Neora - Marketplace'],
[120,'Elleve - Marketplace'],[139,'Infinity - Marketplace'],[140,'Galati - Marketplace'],
[141,'Inovit - Marketplace'],[124,'Bolsa mais brasil - Marketplace'],[155,'Único Skill - Marketplace'],
[156,'Pravaler - Marketplace'],[157,'Faça Acontecer (SICOB) - Marketplace'],
[158,'Ficou Fácil (Santander) - Marketplace'],[159,'Instituto FEPAF - Marketplace'],
[160,'Conect Car - Marketplace'],[162,'Omverso - Marketplace']
];

canal.innerHTML=channels.map(x=>'<option value="'+x[0]+'">'+x[1]+' — '+x[0]+'</option>').join('');

const required=[
'cpf','nome','rg','anoConclusaoEnsinoMedio','sexo','celular','dataNascimento','email',
'logradouro','numero','cep','uf','municipio','businessKeyOferta','tipoIngresso',
'aceiteTermo','aceitaReceberEmail','aceitaReceberSMS','aceitaReceberWhatsApp'
];

let validRows=[];

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
        return '<tr><td>'+(i+2)+'</td><td>'+esc(r.cpf)+'</td><td>'+esc(r.nome)+'</td><td>'+esc(r.businessKeyOferta)+'</td><td>'+esc(r.diasDaSemanaSelecionado||'')+'</td><td class="'+(good?'ok':'bad')+'">'+(good?'PRONTO':'ERRO')+'</td><td>'+miss.map(x=>'Falta: '+x).join('<br>')+'</td></tr>';
      }).join('');
      total.textContent=dataRows.length;
      prontos.textContent=validRows.length;
      erros.textContent=bad;
      resumo.classList.remove('hidden');
      oferta.disabled=validRows.length!==1;
      dmhBox.classList.add('hidden');
      finalBox.classList.add('hidden');
      if(validRows.length>1) alert('Para o primeiro teste, deixe somente 1 linha preenchida na planilha.');
    }catch(err){
      alert('Erro ao ler a planilha: '+err.message);
    }
  };
  rd.readAsArrayBuffer(arquivo.files[0]);
};

oferta.onclick=async()=>{
  if(validRows.length!==1) return;
  if(!opkey.value) return alert('Digite a chave de operação.');
  oferta.disabled=true;
  oferta.textContent='Consultando DMH...';
  try{
    const r=await callApi('preview',validRows[0],opkey.value);
    dmhResult.innerHTML='<p><b>Curso:</b> '+esc(r.offer?.name||'')+'</p>'+
      '<p><b>idDMH:</b> '+esc(r.offer?.idDMH||'')+'</p>'+
      '<p><b>Canal:</b> '+esc(String(canal.value))+'</p>'+
      '<p><b>scheduleList:</b> '+esc(JSON.stringify(r.offer?.scheduleList||[]))+'</p>';
    dmhBox.classList.remove('hidden');
  }catch(err){ alert(err.message); }
  finally{
    oferta.disabled=false;
    oferta.textContent='Consultar oferta no DMH';
  }
};

enviar.onclick=async()=>{
  if(!opkey.value) return alert('Digite a chave de operação.');
  if(!confirm('CONFIRMA a criação de 1 inscrição REAL em PRODUÇÃO?')) return;
  enviar.disabled=true;
  enviar.textContent='Enviando...';
  try{
    const r=await callApi('submit',validRows[0],opkey.value);
    finalBox.classList.remove('hidden');
    const status=r.status?.processamento?.status||r.status?.[0]?.processamento?.status||'RETORNO PENDENTE';
    const id=r.created?.id||r.created?.inscricao?.id||r.created?.idOrigem||'';
    finalResult.innerHTML='<div class="success"><b>Inscrição enviada.</b><br>ID: '+esc(String(id))+'<br>Status de processamento: '+esc(String(status))+'</div>';
    raw.textContent=JSON.stringify(r,null,2);
  }catch(err){
    finalBox.classList.remove('hidden');
    finalResult.innerHTML='<div class="error"><b>Falha:</b> '+esc(err.message)+'</div>';
    raw.textContent=err.raw||'';
  }finally{
    enviar.disabled=false;
    enviar.textContent='Descer inscrição em Produção';
  }
};

async function callApi(action,row,key){
  const res=await fetch(processUrl,{
    method:'POST',
    headers:{'content-type':'application/json','x-operator-key':key},
    body:JSON.stringify({action,row,channelId:Number(canal.value)})
  });
  const txt=await res.text();
  let j={};
  try{j=JSON.parse(txt)}catch{j={error:txt}}
  if(!res.ok||j.ok===false||j.error){
    const e=new Error(j.error||('HTTP '+res.status));
    e.raw=txt;
    throw e;
  }
  return j;
}

function esc(v){
  return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}