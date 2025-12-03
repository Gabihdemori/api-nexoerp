const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Função para formatar datas no padrão dd/mm/aaaa HH:MM
function formatarData(data) {
  if (!data) return null;
  const date = new Date(data);
  
  // Verifica se a data é válida
  if (isNaN(date.getTime())) {
    console.error('Data inválida para formatação:', data);
    return 'Data inválida';
  }
  
  const dia = date.getDate().toString().padStart(2, '0');
  const mes = (date.getMonth() + 1).toString().padStart(2, '0');
  const ano = date.getFullYear().toString(); // 4 dígitos
  const horas = date.getHours().toString().padStart(2, '0');
  const minutos = date.getMinutes().toString().padStart(2, '0');
  
  return `${dia}/${mes}/${ano} ${horas}:${minutos}`;
}

// Função para converter data do formato pt-BR para ISO - CORRIGIDA PARA TIMEZONE
function converterDataPtBrParaISO(dataString) {
  if (!dataString || dataString.trim() === '') {
    console.log('Nenhuma data fornecida, usando data atual (BRT)');
    // Retorna data atual no fuso horário de Brasília
    const agora = new Date();
    const offsetBRT = -3 * 60; // Brasília é UTC-3
    const dataLocal = new Date(agora.getTime() + (agora.getTimezoneOffset() - offsetBRT) * 60000);
    return dataLocal;
  }
  
  console.log('Convertendo data:', dataString);
  
  // Remover espaços extras
  dataString = dataString.trim();
  
  // Verificar se já é um objeto Date
  if (dataString instanceof Date) {
    return dataString;
  }
  
  // Verificar se já está em formato ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(dataString)) {
    const date = new Date(dataString);
    if (!isNaN(date.getTime())) {
      console.log('Data já está em formato ISO:', date.toISOString());
      return date;
    }
  }
  
  // Padrão para dd/mm/aaaa ou dd/mm/aaaa HH:mm
  const padraoComHoras = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/;
  const padraoSemHoras = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  
  let dia, mes, ano, horas = '00', minutos = '00';
  
  const matchComHoras = dataString.match(padraoComHoras);
  const matchSemHoras = dataString.match(padraoSemHoras);
  
  if (matchComHoras) {
    [, dia, mes, ano, horas = '00', minutos = '00'] = matchComHoras;
  } else if (matchSemHoras) {
    [, dia, mes, ano] = matchSemHoras;
  } else {
    console.warn('Formato de data não reconhecido, usando data atual (BRT):', dataString);
    const agora = new Date();
    const offsetBRT = -3 * 60;
    return new Date(agora.getTime() + (agora.getTimezoneOffset() - offsetBRT) * 60000);
  }
  
  // Garantir 2 dígitos
  dia = dia.padStart(2, '0');
  mes = mes.padStart(2, '0');
  horas = horas.padStart(2, '0');
  
  const dataUTC = new Date(Date.UTC(
    parseInt(ano),
    parseInt(mes) - 1, // Mês começa em 0
    parseInt(dia),
    parseInt(horas),
    parseInt(minutos),
    0
  ));
  
  console.log(`Data convertida (UTC): ${dataUTC.toISOString()}`);
  console.log(`Data local (BRT): ${dataUTC.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
  
  return dataUTC;
}

// Função para formatar datas no padrão dd/mm/aaaa HH:MM - CORRIGIDA PARA TIMEZONE
function formatarData(data) {
  if (!data) return null;
  
  const date = new Date(data);
  
  // Verifica se a data é válida
  if (isNaN(date.getTime())) {
    console.error('Data inválida para formatação:', data);
    return 'Data inválida';
  }
  
  // Converter para fuso horário de Brasília para exibição
  const dataBRT = new Date(date.getTime());
  
  const dia = dataBRT.getUTCDate().toString().padStart(2, '0'); // Usar getUTCDate
  const mes = (dataBRT.getUTCMonth() + 1).toString().padStart(2, '0'); // Usar getUTCMonth
  const ano = dataBRT.getUTCFullYear().toString(); // 4 dígitos
  const horas = dataBRT.getUTCHours().toString().padStart(2, '0'); // Usar getUTCHours
  const minutos = dataBRT.getUTCMinutes().toString().padStart(2, '0'); // Usar getUTCMinutes
  
  return `${dia}/${mes}/${ano} ${horas}:${minutos}`;
}

// Função para verificar existência de registros
async function verificarExistenciaRegistros(clienteId, usuarioId, itens = []) {
  const errors = [];

  // Verificar cliente
  const cliente = await prisma.cliente.findUnique({
    where: { id: parseInt(clienteId) }
  });
  if (!cliente) {
    errors.push(`Cliente com ID ${clienteId} não encontrado`);
  }

  // Verificar usuário
  const usuario = await prisma.usuario.findUnique({
    where: { id: parseInt(usuarioId) }
  });
  if (!usuario) {
    errors.push(`Usuário com ID ${usuarioId} não encontrado`);
  }

  // Verificar produtos
  for (const item of itens) {
    const produto = await prisma.produto.findUnique({
      where: { id: parseInt(item.produtoId) }
    });
    
    if (!produto) {
      errors.push(`Produto com ID ${item.produtoId} não encontrado`);
    } else if (produto.tipo === 'Produto' && item.quantidade > (produto.estoque || 0)) {
      // Apenas valida estoque para produtos, e considera 0 se estoque for null
      errors.push(`Estoque insuficiente para o produto ${produto.nome}. Disponível: ${produto.estoque || 0}, Solicitado: ${item.quantidade}`);
    }
  }

  return errors;
}

// Criar venda com itens
const create = async (req, res) => {
  try {
    const { clienteId, usuarioId, data, status, itens, total, observacoes } = req.body;

    // Validações básicas
    if (!clienteId || !usuarioId) {
      return res.status(400).json({ 
        error: 'Dados obrigatórios: clienteId e usuarioId' 
      });
    }

    if (!itens || !Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ 
        error: 'A venda deve conter pelo menos um item' 
      });
    }

    // Validar cada item
    for (const [index, item] of itens.entries()) {
      if (!item.produtoId || isNaN(parseInt(item.produtoId))) {
        return res.status(400).json({ 
          error: `Item ${index + 1}: produtoId é obrigatório e deve ser um número válido` 
        });
      }
      if (!item.quantidade || isNaN(parseInt(item.quantidade)) || parseInt(item.quantidade) <= 0) {
        return res.status(400).json({ 
          error: `Item ${index + 1}: quantidade é obrigatória e deve ser maior que zero` 
        });
      }
      if (!item.precoUnit || isNaN(parseFloat(item.precoUnit)) || parseFloat(item.precoUnit) < 0) {
        return res.status(400).json({ 
          error: `Item ${index + 1}: precoUnit é obrigatório e deve ser um valor não negativo` 
        });
      }
    }

    // Verificar se os registros existem
    const errors = await verificarExistenciaRegistros(clienteId, usuarioId, itens);
    if (errors.length > 0) {
      return res.status(400).json({ 
        error: 'Erro de validação',
        detalhes: errors
      });
    }

    const dataFormatada = converterDataPtBrParaISO(data);
    console.log('Data formatada para salvar no banco:', dataFormatada);

    // Calcular total se não fornecido
    let totalCalculado = total;
    if (!total || isNaN(total)) {
      totalCalculado = itens.reduce((sum, item) => {
        return sum + (parseInt(item.quantidade) * parseFloat(item.precoUnit));
      }, 0);
    }

    // Criar venda com itens em transação
    const venda = await prisma.$transaction(async (tx) => {
      // Criar a venda
      const novaVenda = await tx.venda.create({
        data: {
          clienteId: parseInt(clienteId),
          usuarioId: parseInt(usuarioId),
          data: dataFormatada,
          total: parseFloat(totalCalculado),
          status: status || 'Pendente',
          observacoes: observacoes || null,
          itens: {
            create: itens.map(item => ({
              produtoId: parseInt(item.produtoId),
              quantidade: parseInt(item.quantidade),
              precoUnit: parseFloat(item.precoUnit)
            }))
          }
        },
        include: {
          cliente: {
            select: {
              id: true,
              nome: true,
              email: true
            }
          },
          usuario: {
            select: {
              id: true,
              nome: true,
              email: true
            }
          },
          itens: {
            include: {
              produto: {
                select: {
                  id: true,
                  nome: true,
                  preco: true,
                  tipo: true
                }
              }
            }
          }
        }
      });

      // Atualizar estoque se a venda for Concluida e apenas para produtos (não serviços)
      if (novaVenda.status === 'Concluida') {
        for (const item of itens) {
          // Verificar se é um produto (tipo === 'Produto') e se tem estoque (não é null)
          const produto = await tx.produto.findUnique({
            where: { id: parseInt(item.produtoId) },
            select: { tipo: true, estoque: true }
          });
          
          // Só atualiza estoque se for um Produto e estoque não for null
          if (produto && produto.tipo === 'Produto' && produto.estoque !== null) {
            await tx.produto.update({
              where: { id: parseInt(item.produtoId) },
              data: {
                estoque: {
                  decrement: parseInt(item.quantidade)
                }
              }
            });
          }
        }
      }

      return novaVenda;
    });

    // Formatar datas na resposta
    const vendaFormatada = {
      ...venda,
      data: formatarData(venda.data),
      itens: venda.itens.map(item => ({
        ...item,
        produto: item.produto ? {
          ...item.produto,
          criadoEm: formatarData(item.produto.criadoEm),
          atualizadoEm: formatarData(item.produto.atualizadoEm)
        } : null
      }))
    };

    res.status(201).json({
      message: 'Venda criada com sucesso',
      venda: vendaFormatada
    });
  } catch (err) {
    console.error('Erro ao criar venda:', err);
    
    // Tratamento específico para erros do Prisma
    if (err.code === 'P2003') {
      return res.status(400).json({ 
        error: 'Erro de chave estrangeira',
        detalhes: 'Cliente, usuário ou produto não encontrado. Verifique os IDs informados.'
      });
    }
    
    res.status(400).json({ 
      error: 'Erro ao criar venda', 
      detalhes: err.message 
    });
  }
};

// Listar todas as vendas com filtros
const findAll = async (req, res) => {
  try {
    const { 
      clienteId, 
      usuarioId, 
      status, 
      dataInicio, 
      dataFim,
      page = 1,
      limit = 10
    } = req.query;

    const where = {};
    
    if (clienteId && !isNaN(clienteId)) where.clienteId = parseInt(clienteId);
    if (usuarioId && !isNaN(usuarioId)) where.usuarioId = parseInt(usuarioId);
    if (status) where.status = status;
    
    if (dataInicio || dataFim) {
      where.data = {};
      if (dataInicio) {
        const dataInicioConvertida = converterDataPtBrParaISO(dataInicio);
        where.data.gte = dataInicioConvertida;
      }
      if (dataFim) {
        const dataFimConvertida = converterDataPtBrParaISO(dataFim);
        // Ajusta para o final do dia
        dataFimConvertida.setHours(23, 59, 59, 999);
        where.data.lte = dataFimConvertida;
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [vendas, total] = await Promise.all([
      prisma.venda.findMany({
        where,
        include: {
          cliente: {
            select: {
              id: true,
              nome: true,
              email: true
            }
          },
          usuario: {
            select: {
              id: true,
              nome: true,
              email: true
            }
          },
          itens: {
            include: {
              produto: {
                select: {
                  id: true,
                  nome: true,
                  tipo: true
                }
              }
            }
          }
        },
        orderBy: {
          data: 'desc'
        },
        skip,
        take: parseInt(limit)
      }),
      prisma.venda.count({ where })
    ]);

    // Formatar datas
    const vendasFormatadas = vendas.map(venda => ({
      ...venda,
      data: formatarData(venda.data)
    }));

    res.json({
      vendas: vendasFormatadas,
      paginacao: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('Erro ao buscar vendas:', err);
    res.status(500).json({ 
      error: 'Erro ao buscar vendas',
      detalhes: err.message
    });
  }
};

// Buscar venda por ID
const findOne = async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

  try {
    const venda = await prisma.venda.findUnique({
      where: { id },
      include: {
        cliente: true,
        usuario: {
          select: {
            id: true,
            nome: true,
            email: true,
            perfil: true
          }
        },
        itens: {
          include: {
            produto: true
          }
        }
      }
    });

    if (!venda) return res.status(404).json({ error: 'Venda não encontrada' });

    // Formatar datas
    const vendaFormatada = {
      ...venda,
      data: formatarData(venda.data),
      cliente: venda.cliente ? {
        ...venda.cliente,
        criadoEm: formatarData(venda.cliente.criadoEm),
        atualizadoEm: formatarData(venda.cliente.atualizadoEm)
      } : null,
      itens: venda.itens.map(item => ({
        ...item,
        produto: item.produto ? {
          ...item.produto,
          criadoEm: formatarData(item.produto.criadoEm),
          atualizadoEm: formatarData(item.produto.atualizadoEm)
        } : null
      }))
    };

    res.json(vendaFormatada);
  } catch (err) {
    console.error('Erro ao buscar venda:', err);
    res.status(500).json({ 
      error: 'Erro ao buscar venda',
      detalhes: err.message
    });
  }
};

// Atualizar venda
const update = async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

  try {
    const { data, status, observacoes, ...rest } = req.body;
    
    console.log('Dados recebidos para atualização:', req.body);
    console.log('Data recebida:', data);
    
    // Validar status se estiver sendo atualizado
    if (status && !['Concluida', 'Pendente', 'Cancelada'].includes(status)) {
      return res.status(400).json({ 
        error: 'Status inválido. Use: Concluida, Pendente ou Cancelada' 
      });
    }

    const dataFormatada = data ? converterDataPtBrParaISO(data) : undefined;
    if (dataFormatada) {
      console.log('Data formatada para atualização:', dataFormatada);
    }

    // Buscar venda atual para verificar mudanças de status
    const vendaAtual = await prisma.venda.findUnique({
      where: { id },
      include: { 
        itens: {
          include: {
            produto: {
              select: {
                id: true,
                tipo: true
              }
            }
          }
        } 
      }
    });

    if (!vendaAtual) {
      return res.status(404).json({ error: 'Venda não encontrada' });
    }

    // Preparar dados para atualização
    const dadosAtualizacao = {
      ...rest,
      ...(observacoes !== undefined && { observacoes })
    };

    // Apenas adicionar campos se foram fornecidos
    if (data) dadosAtualizacao.data = dataFormatada;
    if (status) dadosAtualizacao.status = status;

    console.log('Dados que serão enviados para atualização:', dadosAtualizacao);

    const venda = await prisma.$transaction(async (tx) => {
      // Atualizar venda
      const vendaAtualizada = await tx.venda.update({
        where: { id },
        data: dadosAtualizacao,
        include: {
          cliente: true,
          usuario: {
            select: {
              id: true,
              nome: true
            }
          },
          itens: {
            include: {
              produto: true
            }
          }
        }
      });

      // Gerenciar estoque baseado na mudança de status - APENAS para Produtos com estoque não null
      if (vendaAtual.status !== status) {
        if (status === 'Concluida') {
          // Diminuir estoque APENAS para produtos
          for (const item of vendaAtual.itens) {
            if (item.produto.tipo === 'Produto') {
              await tx.produto.update({
                where: { id: item.produtoId },
                data: {
                  estoque: {
                    decrement: item.quantidade
                  }
                }
              });
            }
          }
        } else if (vendaAtual.status === 'Concluida' && status !== 'Concluida') {
          // Reverter estoque APENAS para produtos
          for (const item of vendaAtual.itens) {
            if (item.produto.tipo === 'Produto') {
              await tx.produto.update({
                where: { id: item.produtoId },
                data: {
                  estoque: {
                    increment: item.quantidade
                  }
                }
              });
            }
          }
        }
      }

      return vendaAtualizada;
    });

    // Formatar datas na resposta
    const vendaFormatada = {
      ...venda,
      data: formatarData(venda.data)
    };

    res.json(vendaFormatada);
  } catch (err) {
    console.error('Erro ao atualizar venda:', err);
    res.status(400).json({ 
      error: 'Erro ao atualizar venda',
      detalhes: err.message
    });
  }
};

// Deletar venda
const remove = async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

  try {
    // Buscar venda para verificar status e itens
    const venda = await prisma.venda.findUnique({
      where: { id },
      include: { 
        itens: {
          include: {
            produto: {
              select: {
                id: true,
                tipo: true
              }
            }
          }
        } 
      }
    });

    if (!venda) {
      return res.status(404).json({ error: 'Venda não encontrada' });
    }

    await prisma.$transaction(async (tx) => {
      // Reverter estoque APENAS se a venda estava Concluida e APENAS para produtos
      if (venda.status === 'Concluida') {
        for (const item of venda.itens) {
          if (item.produto.tipo === 'Produto') {
            await tx.produto.update({
              where: { id: item.produtoId },
              data: {
                estoque: {
                  increment: item.quantidade
                }
              }
            });
          }
        }
      }

      // Deletar venda (os itens serão deletados em cascade)
      await tx.venda.delete({ where: { id } });
    });

    res.json({ 
      message: 'Venda deletada com sucesso',
      id: id
    });
  } catch (err) {
    console.error('Erro ao deletar venda:', err);
    res.status(400).json({ 
      error: 'Erro ao deletar venda',
      detalhes: err.message
    });
  }
};

// Método para atualizar status da venda
const updateStatus = async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

  try {
    const { status } = req.body;

    if (!status || !['Concluida', 'Pendente', 'Cancelada'].includes(status)) {
      return res.status(400).json({ 
        error: 'Status inválido. Use: Concluida, Pendente ou Cancelada' 
      });
    }

    const venda = await prisma.$transaction(async (tx) => {
      const vendaAtual = await tx.venda.findUnique({
        where: { id },
        include: { 
          itens: {
            include: {
              produto: {
                select: {
                  id: true,
                  tipo: true
                }
              }
            }
          } 
        }
      });

      if (!vendaAtual) {
        throw new Error('Venda não encontrada');
      }

      // Gerenciar estoque baseado na mudança de status - APENAS para Produtos
      if (vendaAtual.status !== status) {
        if (status === 'Concluida') {
          // Diminuir estoque APENAS para produtos
          for (const item of vendaAtual.itens) {
            if (item.produto.tipo === 'Produto') {
              await tx.produto.update({
                where: { id: item.produtoId },
                data: {
                  estoque: {
                    decrement: item.quantidade
                  }
                }
              });
            }
          }
        } else if (vendaAtual.status === 'Concluida' && status !== 'Concluida') {
          // Reverter estoque APENAS para produtos
          for (const item of vendaAtual.itens) {
            if (item.produto.tipo === 'Produto') {
              await tx.produto.update({
                where: { id: item.produtoId },
                data: {
                  estoque: {
                    increment: item.quantidade
                  }
                }
              });
            }
          }
        }
      }

      // Atualizar status
      return await tx.venda.update({
        where: { id },
        data: { status },
        include: {
          cliente: {
            select: {
              id: true,
              nome: true
            }
          },
          itens: {
            include: {
              produto: {
                select: {
                  id: true,
                  nome: true,
                  tipo: true
                }
              }
            }
          }
        }
      });
    });

    const vendaFormatada = {
      ...venda,
      data: formatarData(venda.data)
    };

    res.json(vendaFormatada);
  } catch (err) {
    console.error('Erro ao atualizar status:', err);
    res.status(400).json({ 
      error: 'Erro ao atualizar status da venda',
      detalhes: err.message
    });
  }
};

module.exports = {
  create,
  findAll,
  findOne,
  update,
  remove,
  updateStatus
};