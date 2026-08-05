# Corona Opening of Summer — Programação de Produção

Planilha online de escopo para a produção da viagem/experiência do evento Corona Summer em Lençóis Maranhenses (Barreirinhas/Atins).

- **Página**: `index.html` — arquivo único (HTML + CSS + JS embutido), sem build, sem dependências externas.
- **Estrutura**: programação dividida em Dia 01–05; cada item é um dropdown com referência (horário, local, descrição, observações da vistoria técnica) e uma tabela de necessidades editável (Item, Qtd, Estimativa $ mín/máx, Notas, Início da logística, Notas, Item planilha).
- **Idiomas**: interface em PT/EN/ES. O conteúdo da programação (horários, descrições, observações) está só em português — tradução ainda pendente.
- **Temas**: dark/light, com paleta própria em cada modo (dourado no escuro, azul no claro).
- **Dados**: cada edição é salva automaticamente no `localStorage` do navegador de quem estiver usando — não sincroniza entre pessoas/dispositivos. Ainda não há back-end.

## Rodar localmente

Não precisa de servidor — basta abrir `index.html` no navegador. Para testar com um servidor local (recomendado, evita bloqueios de `file://`):

```bash
python3 -m http.server 8000
# depois abra http://localhost:8000
```

## Publicado em

- GitHub Pages: https://mussaporai.github.io/corona-opening-of-summer/

## Pendências conhecidas

- Tradução do conteúdo da programação para EN/ES.
- Persistência compartilhada entre usuários (hoje é só local no navegador).
