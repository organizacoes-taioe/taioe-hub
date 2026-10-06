/* /entrar/cadastro/: na primeira vez, o nome e o aceite; depois de uma mudança dos termos ou
   da política, só o novo aceite. Nenhuma pergunta de idade (decisão de 26/09). */
(function () {
  'use strict';
  var H = TaioeHub, sb = TaioeSessao.cliente(), perfil = null, vig = null, uid = null;

  function dataBr(iso) { var p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }

  H.$('sair').addEventListener('click', async function () { await TaioeSessao.sair(false); location.replace('/'); });

  (async function () {
    var sessao = await H.sessaoAtual();
    if (!sessao) { TaioeSessao.irParaEntrar(); return; }
    uid = sessao.user.id;
    try {
      perfil = await H.lerPerfil();
      vig = await H.documentosVigentes();
    } catch (e) {
      H.mostrar('carregando', false);
      H.mostrar('form', true);
      H.avisar('aviso', H.mensagemDeErro(e), 'erro');
      return;
    }
    if (!vig.termos || !vig.politica) {
      H.$('carregando').textContent = 'Os termos de uso ainda não foram publicados. Volte em breve.';
      return;
    }
    if (perfil && perfil.termos_versao === vig.termos.id && perfil.politica_versao === vig.politica.id) {
      H.irAoDestino();                                     // nada a fazer aqui
      return;
    }
    H.$('email').textContent = sessao.user.email;
    H.$('link-termos').href = vig.termos.url;
    H.$('link-politica').href = vig.politica.url;
    H.$('versoes').textContent = '(versões de ' + dataBr(vig.termos.publicado_em) + ' e de '
      + dataBr(vig.politica.publicado_em) + ')';
    if (perfil) {
      H.$('titulo').textContent = 'Termos atualizados';
      H.mostrar('explica-novo-aceite', true);
      H.mostrar('bloco-nome', false);
    }
    H.mostrar('carregando', false);
    H.mostrar('form', true);
    (perfil ? H.$('aceite') : H.$('nome')).focus();
  })();

  H.$('form').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var nome = H.$('nome').value.trim().replace(/\s+/g, ' ');
    if (!perfil && (nome.length < 1 || nome.length > 40)) {
      H.avisar('aviso', 'Escreva como quer ser chamado (até 40 letras).', 'erro'); H.$('nome').focus(); return;
    }
    if (!H.$('aceite').checked) {
      H.avisar('aviso', 'Para usar a Taioé, é preciso aceitar os termos e a política.', 'erro'); return;
    }
    H.$('salvar').disabled = true;
    H.avisar('aviso', 'Salvando…');
    var tabela = sb.schema('conta').from('perfis'), r;
    if (perfil) {
      r = await tabela.update({ termos_versao: vig.termos.id, politica_versao: vig.politica.id }).eq('usuario_id', uid);
    } else {
      r = await tabela.insert({ usuario_id: uid, nome: nome, termos_versao: vig.termos.id, politica_versao: vig.politica.id });
    }
    if (r.error) {
      H.$('salvar').disabled = false;
      H.avisar('aviso', /PT400|vigente|inválida/.test(r.error.message || '')
        ? 'Os termos mudaram enquanto você lia. Recarregue a página.' : H.mensagemDeErro(r.error), 'erro');
      return;
    }
    try { await sb.schema('conta').rpc('registrar_acesso', { app: 'hub' }); } catch (e) {}
    H.irAoDestino();
  });
})();
