#!/usr/bin/env python3
"""Gera arte pela API de imagens da OpenAI.

Por que este script existe: o modelo gratuito que eu uso hoje (z_image) e
texto puro -- nao aceita imagem de referencia. Sem referencia nao da para
pedir "o mesmo bicho, outro passo" nem "no estilo desta arte aqui", que e
exatamente o que falta para os monstros terem dois quadros de caminhada
coerentes e combinarem com a arte que ja esta no jogo.

O endpoint /v1/images/edits aceita imagem de entrada. E isso que se compra
com a chave.

A chave NUNCA aparece aqui dentro. Ela vem de uma destas fontes, nesta
ordem, e o script nao imprime nem grava o valor em lugar nenhum:

  1. variavel de ambiente OPENAI_API_KEY
  2. arquivo .env nesta pasta (ignorado pelo git)
  3. nada -- e ai o script recusa e explica

  Se a chave estiver como CREDENCIAL DE API do ambiente de nuvem, ela nem
  chega aqui: o proxy a injeta depois que a requisicao sai da maquina.
  Nesse caso rode com --sem-chave.

Uso:
    python3 gera_arte.py --prompt "..." --saida bicho.png
    python3 gera_arte.py --prompt "outro passo" --ref bicho.png --saida bicho2.png
    python3 gera_arte.py --lote receitas.json --pasta saida/
"""

import argparse
import base64
import json
import mimetypes
import os
import sys
import urllib.request
import uuid

AQUI = os.path.dirname(os.path.abspath(__file__))
BASE = os.environ.get('OPENAI_BASE_URL', 'https://api.openai.com/v1')


def le_dotenv(caminho):
    """Leitor minimo de .env. Sem dependencia: este script precisa rodar
    num container recem-criado sem instalar nada."""
    fora = {}
    if not os.path.exists(caminho):
        return fora
    with open(caminho, encoding='utf-8') as fp:
        for linha in fp:
            linha = linha.strip()
            if not linha or linha.startswith('#') or '=' not in linha:
                continue
            chave, _, valor = linha.partition('=')
            fora[chave.strip()] = valor.strip().strip('"').strip("'")
    return fora


def acha_chave(exigir=True):
    valor = os.environ.get('OPENAI_API_KEY')
    if not valor:
        valor = le_dotenv(os.path.join(AQUI, '.env')).get('OPENAI_API_KEY')
    if valor in (None, '', 'coloque-a-chave-aqui'):
        if not exigir:
            return None
        sys.exit(
            'Sem chave. Tres caminhos, do mais seguro para o menos:\n'
            '  1. claude.ai/code > editar ambiente > API credentials\n'
            '     (a chave nunca entra nesta maquina; rode com --sem-chave)\n'
            '  2. claude.ai/code > editar ambiente > Environment variables\n'
            '     nome OPENAI_API_KEY -- nao passa pelo historico da conversa\n'
            '  3. preencher o .env desta pasta a mao\n'
            'Ver README.md nesta pasta.'
        )
    return valor


def cabecalhos(chave):
    h = {'Content-Type': 'application/json'}
    if chave:
        h['Authorization'] = 'Bearer ' + chave
    return h


def post_json(rota, corpo, chave):
    req = urllib.request.Request(
        BASE + rota, data=json.dumps(corpo).encode('utf-8'),
        headers=cabecalhos(chave), method='POST')
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read().decode('utf-8'))


def post_multipart(rota, campos, arquivos, chave):
    """multipart/form-data na mao, porque requests pode nao estar instalado."""
    limite = '----arte' + uuid.uuid4().hex
    corpo = b''
    for nome, valor in campos.items():
        corpo += ('--%s\r\nContent-Disposition: form-data; name="%s"\r\n\r\n%s\r\n'
                  % (limite, nome, valor)).encode('utf-8')
    for nome, caminho in arquivos:
        tipo = mimetypes.guess_type(caminho)[0] or 'application/octet-stream'
        corpo += ('--%s\r\nContent-Disposition: form-data; name="%s"; filename="%s"\r\n'
                  'Content-Type: %s\r\n\r\n'
                  % (limite, nome, os.path.basename(caminho), tipo)).encode('utf-8')
        with open(caminho, 'rb') as fp:
            corpo += fp.read()
        corpo += b'\r\n'
    corpo += ('--%s--\r\n' % limite).encode('utf-8')

    h = {'Content-Type': 'multipart/form-data; boundary=' + limite}
    if chave:
        h['Authorization'] = 'Bearer ' + chave
    req = urllib.request.Request(BASE + rota, data=corpo, headers=h, method='POST')
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read().decode('utf-8'))


def salva(resposta, destino):
    dado = resposta['data'][0]
    bruto = base64.b64decode(dado['b64_json']) if 'b64_json' in dado else \
        urllib.request.urlopen(dado['url'], timeout=120).read()
    os.makedirs(os.path.dirname(os.path.abspath(destino)), exist_ok=True)
    with open(destino, 'wb') as fp:
        fp.write(bruto)
    return destino


def gera(prompt, destino, ref=None, modelo=None, tamanho='1024x1024',
         fundo='opaque', chave=None):
    modelo = modelo or os.environ.get('OPENAI_IMAGE_MODEL') or \
        le_dotenv(os.path.join(AQUI, '.env')).get('OPENAI_IMAGE_MODEL') or 'gpt-image-1'

    if ref:
        # /edits: e este endpoint que resolve "o mesmo bicho, outro passo".
        campos = {'model': modelo, 'prompt': prompt, 'size': tamanho}
        arquivos = [('image[]', r) for r in (ref if isinstance(ref, list) else [ref])]
        resp = post_multipart('/images/edits', campos, arquivos, chave)
    else:
        corpo = {'model': modelo, 'prompt': prompt, 'size': tamanho, 'n': 1}
        if fundo:
            corpo['background'] = fundo
        resp = post_json('/images/generations', corpo, chave)
    return salva(resp, destino)


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--prompt')
    p.add_argument('--saida')
    p.add_argument('--ref', action='append',
                   help='imagem de referencia; repita para varias')
    p.add_argument('--lote', help='json: [{"prompt":..,"saida":..,"ref":[..]}]')
    p.add_argument('--pasta', default='.')
    p.add_argument('--modelo')
    p.add_argument('--tamanho', default='1024x1024')
    p.add_argument('--fundo', default='opaque',
                   choices=['opaque', 'transparent', 'auto'])
    p.add_argument('--sem-chave', action='store_true',
                   help='a chave e injetada pelo proxy do ambiente')
    p.add_argument('--testar', action='store_true',
                   help='so confere se a autenticacao funciona')
    args = p.parse_args()

    chave = None if args.sem_chave else acha_chave()

    if args.testar:
        req = urllib.request.Request(BASE + '/models', headers=cabecalhos(chave))
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                n = len(json.loads(r.read().decode('utf-8')).get('data', []))
            print('autenticacao OK -- %d modelos visiveis' % n)
        except urllib.error.HTTPError as e:
            print('falhou: HTTP %s -- %s' % (e.code, e.read().decode('utf-8')[:300]))
            sys.exit(1)
        return

    if args.lote:
        with open(args.lote, encoding='utf-8') as fp:
            receitas = json.load(fp)
        for i, r in enumerate(receitas):
            destino = os.path.join(args.pasta, r['saida'])
            print('[%d/%d] %s' % (i + 1, len(receitas), destino), flush=True)
            gera(r['prompt'], destino, r.get('ref'), args.modelo,
                 r.get('tamanho', args.tamanho), r.get('fundo', args.fundo), chave)
        return

    if not args.prompt or not args.saida:
        p.error('use --prompt e --saida, ou --lote')
    print(gera(args.prompt, os.path.join(args.pasta, args.saida), args.ref,
               args.modelo, args.tamanho, args.fundo, chave))


if __name__ == '__main__':
    main()
