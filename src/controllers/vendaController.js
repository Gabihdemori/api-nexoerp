const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();


function parseDataBrasileira(dataString) {
  if (!dataString || dataString.trim() === '') {
    console.log('Nenhuma data fornecida, usando data/hora atual');
    return new Date();
  }
  
  dataString = dataString.trim();
  
  // Se já for um objeto Date, retorna ele mesmo
  if (dataString instanceof Date) {
    return dataString;
  }
  
  // Se já está em formato ISO, converte diretamente
  if (/^\d{4}-\d{2}-\d{2}/.test(dataString)) {
    const date = new Date(dataString);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  // Regex para formatos brasileiros
  const formatoComHoras = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/;
  const formatoSemHoras = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  
  let dia, mes, ano, horas = '00', minutos = '00';
  
  const matchComHoras = dataString.match(formatoComHoras);
  const matchSemHoras = dataString.match(formatoSemHoras);
  
  if (matchComHoras) {
    [, dia, mes, ano, horas = '00', minutos = '00'] = matchComHoras;
  } else if (matchSemHoras) {
    [, dia, mes, ano] = matchSemHoras;
  } else {
    // Tenta converter como string de data padrão
    const date = new Date(dataString);
    if (!isNaN(date.getTime())) {
      return date;
    }
    
    console.warn('Formato de data não reconhecido, usando data atual:', dataString);
    return new Date();
  }
  
  // Garantir 2 dígitos
  dia = dia.padStart(2, '0');
  mes = mes.padStart(2, '0');
  horas = horas.padStart(2, '0');
  
  // IMPORTANTE: Criar data no fuso horário local, mas sem ajuste de timezone
  // Isso garante que dd/mm/aaaa será salvo como dd/mm/aaaa
  const date = new Date(ano, mes - 1, dia, horas, minutos, 0, 0);
  
  console.log(`Data parseada: ${dataString} -> ${date.toISOString()}`);
  return date;
}

/**
 * Formata uma data para o padrão brasileiro (dd/mm/aaaa HH:MM)
 * Usa os métodos locais para evitar problemas de timezone
 */
function formatarDataParaExibicao(data) {
  if (!data) return null;
  
  const date = new Date(data);
  
  if (isNaN(date.getTime())) {
    console.error('Data inválida para formatação:', data);
    return 'Data inválida';
  }
  
  // Usar métodos locais para manter a data como foi informada
  const dia = date.getDate().toString().padStart(2, '0');
  const mes = (date.getMonth() + 1).toString().padStart(2, '0');
  const ano = date.getFullYear().toString();
  const horas = date.getHours().toString().padStart(2, '0');
  const minutos = date.getMinutes().toString().padStart(2, '0');
  
  return `${dia}/${mes}/${ano} ${horas}:${minutos}`;
}

/**
 * Verifica se dois objetos Date representam o mesmo dia (ignorando horas)
 */
function isMesmoDia(data1, data2) {
  if (!data1 || !data2) return false;
  
  const d1 = new Date(data1);
  const d2 = new Date(data2);
  
  return d1.getDate() === d2.getDate() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getFullYear() === d2.getFullYear();
}

// =============================================
// FUNÇÕES DE VALIDAÇÃO
// =============================================

async function verificarExistenciaRegistros(clienteId, usuarioId, itens = []) {
  const errors = [];

  try {
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
      } else if (produto.tipo === 'Produto') {
        const estoqueDisponivel = produto.estoque !== null ? produto.estoque : 0;
        const quantidadeSolicitada = parseInt(item.quantidade) || 0;
        
        if (quantidadeSolicitada > estoqueDisponivel) {
          errors.push(`Estoque insuficiente para o produto ${produto.nome}. Disponível: ${estoqueDisponivel}, Solicitado: ${quantidadeSolicitada}`);
        }
      }
    }
  } catch (error) {
    errors.push(`Erro ao verificar registros: ${error.message}`);
  }

  return errors;
}

// =============================================
// CONTROLADORES DE VENDAS
// =============================================

const create = async (req, res) => {
  try {
    const { clienteId, usuarioId, data, status, itens, total, observacoes } = req.body;

    console.log('=== INICIANDO CRIAÇÃO DE VENDA ===');
    console.log('Data recebida:', data);
    console.log('Cliente ID:', clienteId);
    console.log('Itens:', itens);

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

    // Processar data - usar data fornecida ou data atual
    const dataVenda = data ? parseDataBrasileira(data) : new Date();
    console.log('Data que será salva:', dataVenda.toISOString());
    console.log('Data formatada para exibição:', formatarDataParaExibicao(dataVenda));

    // Calcular total
    let totalCalculado = 0;
    if (total && !isNaN(parseFloat(total))) {
      totalCalculado = parseFloat(total);
    } else {
      totalCalculado = itens.reduce((soma, item) => {
        return soma + (parseInt(item.quantidade) * parseFloat(item.precoUnit));
      }, 0);
    }

    // Criar venda em transação
    const venda = await prisma.$transaction(async (tx) => {
      // 1. Criar a venda
      const novaVenda = await tx.venda.create({
        data: {
          clienteId: parseInt(clienteId),
          usuarioId: parseInt(usuarioId),
          data: dataVenda,
          total: totalCalculado,
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
              email: true,
              cidade: true,
              estado: true
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
                  tipo: true,
                  estoque: true
                }
              }
            }
          }
        }
      });

      // 2. Atualizar estoque se a venda for Concluída
      if (novaVenda.status === 'Concluida') {
        for (const item of itens) {
          const produto = await tx.produto.findUnique({
            where: { id: parseInt(item.produtoId) },
            select: { tipo: true }
          });
          
          if (produto && produto.tipo === 'Produto') {
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

    // Formatar resposta
    const resposta = {
      message: 'Venda criada com sucesso',
      venda: {
        ...venda,
        data: formatarDataParaExibicao(venda.data),
        itens: venda.itens.map(item => ({
          ...item,
          produto: item.produto ? {
            ...item.produto,
            criadoEm: formatarDataParaExibicao(item.produto.criadoEm),
            atualizadoEm: formatarDataParaExibicao(item.produto.atualizadoEm)
          } : null
        }))
      }
    };

    console.log('=== VENDA CRIADA COM SUCESSO ===');
    res.status(201).json(resposta);

  } catch (error) {
    console.error('Erro ao criar venda:', error);
    
    // Tratamento de erros específicos do Prisma
    if (error.code === 'P2003') {
      return res.status(400).json({ 
        error: 'Erro de referência',
        detalhes: 'Cliente, usuário ou produto não encontrado. Verifique os IDs.'
      });
    }
    
    if (error.code === 'P2002') {
      return res.status(400).json({ 
        error: 'Erro de duplicidade',
        detalhes: 'Já existe um registro com esses dados.'
      });
    }
    
    res.status(500).json({ 
      error: 'Erro interno ao criar venda',
      detalhes: error.message 
    });
  }
};

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
    
    // Filtros
    if (clienteId && !isNaN(clienteId)) where.clienteId = parseInt(clienteId);
    if (usuarioId && !isNaN(usuarioId)) where.usuarioId = parseInt(usuarioId);
    if (status) where.status = status;
    
    // Filtros de data
    if (dataInicio || dataFim) {
      where.data = {};
      if (dataInicio) {
        const inicio = parseDataBrasileira(dataInicio);
        inicio.setHours(0, 0, 0, 0);
        where.data.gte = inicio;
      }
      if (dataFim) {
        const fim = parseDataBrasileira(dataFim);
        fim.setHours(23, 59, 59, 999);
        where.data.lte = fim;
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Buscar vendas e total
    const [vendas, total] = await Promise.all([
      prisma.venda.findMany({
        where,
        include: {
          cliente: {
            select: {
              id: true,
              nome: true,
              email: true,
              cidade: true
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

    // Formatar datas na resposta
    const vendasFormatadas = vendas.map(venda => ({
      ...venda,
      data: formatarDataParaExibicao(venda.data),
      cliente: venda.cliente ? {
        ...venda.cliente,
        criadoEm: formatarDataParaExibicao(venda.cliente.criadoEm),
        atualizadoEm: formatarDataParaExibicao(venda.cliente.atualizadoEm)
      } : null
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

  } catch (error) {
    console.error('Erro ao buscar vendas:', error);
    res.status(500).json({ 
      error: 'Erro ao buscar vendas',
      detalhes: error.message
    });
  }
};

const findOne = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const venda = await prisma.venda.findUnique({
      where: { id },
      include: {
        cliente: {
          select: {
            id: true,
            nome: true,
            email: true,
            telefone: true,
            cidade: true,
            estado: true
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
                descricao: true,
                preco: true,
                tipo: true,
                estoque: true
              }
            }
          }
        }
      }
    });

    if (!venda) {
      return res.status(404).json({ error: 'Venda não encontrada' });
    }

    // Formatar datas
    const vendaFormatada = {
      ...venda,
      data: formatarDataParaExibicao(venda.data),
      cliente: venda.cliente ? {
        ...venda.cliente,
        criadoEm: formatarDataParaExibicao(venda.cliente.criadoEm),
        atualizadoEm: formatarDataParaExibicao(venda.cliente.atualizadoEm)
      } : null,
      itens: venda.itens.map(item => ({
        ...item,
        produto: item.produto ? {
          ...item.produto,
          criadoEm: formatarDataParaExibicao(item.produto.criadoEm),
          atualizadoEm: formatarDataParaExibicao(item.produto.atualizadoEm)
        } : null
      }))
    };

    res.json(vendaFormatada);

  } catch (error) {
    console.error('Erro ao buscar venda:', error);
    res.status(500).json({ 
      error: 'Erro ao buscar venda',
      detalhes: error.message
    });
  }
};

const update = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const { data, status, observacoes, ...outrosDados } = req.body;
    
    console.log('Atualizando venda ID:', id);
    console.log('Dados recebidos:', req.body);

    // Validar status
    if (status && !['Concluida', 'Pendente', 'Cancelada'].includes(status)) {
      return res.status(400).json({ 
        error: 'Status inválido. Use: Concluida, Pendente ou Cancelada' 
      });
    }

    // Buscar venda atual
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
    const dadosAtualizacao = { ...outrosDados };
    if (observacoes !== undefined) dadosAtualizacao.observacoes = observacoes;
    if (status) dadosAtualizacao.status = status;
    if (data) dadosAtualizacao.data = parseDataBrasileira(data);

    // Atualizar em transação
    const vendaAtualizada = await prisma.$transaction(async (tx) => {
      // Atualizar venda
      const venda = await tx.venda.update({
        where: { id },
        data: dadosAtualizacao,
        include: {
          cliente: {
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

      // Gerenciar estoque se houve mudança de status
      if (vendaAtual.status !== status) {
        if (status === 'Concluida') {
          // Diminuir estoque para produtos
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
          // Reverter estoque para produtos
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

      return venda;
    });

    // Formatar resposta
    const resposta = {
      ...vendaAtualizada,
      data: formatarDataParaExibicao(vendaAtualizada.data)
    };

    res.json(resposta);

  } catch (error) {
    console.error('Erro ao atualizar venda:', error);
    res.status(400).json({ 
      error: 'Erro ao atualizar venda',
      detalhes: error.message
    });
  }
};

const remove = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    // Buscar venda para verificar status
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
      // Reverter estoque se a venda estava Concluída
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

      // Deletar venda (itens serão deletados em cascade)
      await tx.venda.delete({ where: { id } });
    });

    res.json({ 
      message: 'Venda deletada com sucesso',
      id: id
    });

  } catch (error) {
    console.error('Erro ao deletar venda:', error);
    res.status(400).json({ 
      error: 'Erro ao deletar venda',
      detalhes: error.message
    });
  }
};

const updateStatus = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const { status } = req.body;

    if (!status || !['Concluida', 'Pendente', 'Cancelada'].includes(status)) {
      return res.status(400).json({ 
        error: 'Status inválido. Use: Concluida, Pendente ou Cancelada' 
      });
    }

    const venda = await prisma.$transaction(async (tx) => {
      // Buscar venda atual
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

      // Gerenciar estoque baseado na mudança de status
      if (vendaAtual.status !== status) {
        if (status === 'Concluida') {
          // Diminuir estoque para produtos
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
          // Reverter estoque para produtos
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

    const resposta = {
      ...venda,
      data: formatarDataParaExibicao(venda.data)
    };

    res.json(resposta);

  } catch (error) {
    console.error('Erro ao atualizar status:', error);
    res.status(400).json({ 
      error: 'Erro ao atualizar status da venda',
      detalhes: error.message
    });
  }
};

// Método adicional para dashboard - vendas do dia
const getVendasDoDia = async (req, res) => {
  try {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);

    const vendas = await prisma.venda.findMany({
      where: {
        data: {
          gte: hoje,
          lt: amanha
        }
      },
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
                nome: true
              }
            }
          }
        }
      },
      orderBy: {
        data: 'desc'
      }
    });

    // Calcular total do dia
    const totalDia = vendas.reduce((soma, venda) => {
      return soma + (venda.total || 0);
    }, 0);

    res.json({
      data: hoje.toISOString().split('T')[0],
      totalVendas: vendas.length,
      totalValor: totalDia,
      vendas: vendas.map(v => ({
        ...v,
        data: formatarDataParaExibicao(v.data)
      }))
    });

  } catch (error) {
    console.error('Erro ao buscar vendas do dia:', error);
    res.status(500).json({ 
      error: 'Erro ao buscar vendas do dia',
      detalhes: error.message
    });
  }
};

// Método para estatísticas do dashboard
const getEstatisticasDashboard = async (req, res) => {
  try {
    const hoje = new Date();
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const inicioDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    
    // Executar todas as consultas em paralelo
    const [
      totalVendasDia,
      totalVendasMes,
      totalClientes,
      vendasPorDia
    ] = await Promise.all([
      // Vendas do dia
      prisma.venda.aggregate({
        where: {
          data: {
            gte: inicioDia
          }
        },
        _sum: {
          total: true
        },
        _count: {
          id: true
        }
      }),
      
      // Vendas do mês
      prisma.venda.aggregate({
        where: {
          data: {
            gte: inicioMes
          }
        },
        _sum: {
          total: true
        }
      }),
      
      // Total de clientes
      prisma.cliente.count(),
      
      // Vendas dos últimos 7 dias para gráfico
      prisma.venda.groupBy({
        by: ['data'],
        where: {
          data: {
            gte: new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000)
          }
        },
        _sum: {
          total: true
        },
        _count: {
          id: true
        },
        orderBy: {
          data: 'asc'
        }
      })
    ]);

    res.json({
      vendasDoDia: {
        quantidade: totalVendasDia._count.id || 0,
        valor: totalVendasDia._sum.total || 0
      },
      vendasDoMes: {
        valor: totalVendasMes._sum.total || 0
      },
      totalClientes,
      vendasUltimos7Dias: vendasPorDia.map(item => ({
        data: formatarDataParaExibicao(item.data),
        total: item._sum.total || 0,
        quantidade: item._count.id || 0
      }))
    });

  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    res.status(500).json({ 
      error: 'Erro ao buscar estatísticas',
      detalhes: error.message
    });
  }
};


module.exports = {
  create,
  findAll,
  findOne,
  update,
  remove,
  updateStatus,
  getVendasDoDia,
  getEstatisticasDashboard
};