const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Formata datas no padrão brasileiro dd/mm/aa HH:MM
 */
function formatarDatas(relatorio) {
  if (!relatorio) return relatorio;
  
  const formatarData = (data) => {
    if (!data) return null;
    const date = new Date(data);
    
    // Formata para dd/mm/aa HH:MM
    const dia = date.getDate().toString().padStart(2, '0');
    const mes = (date.getMonth() + 1).toString().padStart(2, '0');
    const ano = date.getFullYear().toString().slice(-2);
    const horas = date.getHours().toString().padStart(2, '0');
    const minutos = date.getMinutes().toString().padStart(2, '0');
    
    return `${dia}/${mes}/${ano} ${horas}:${minutos}`;
  };

  return {
    ...relatorio,
    dataInicio: formatarData(relatorio.dataInicio),
    dataFim: formatarData(relatorio.dataFim),
    dataRelatorio: formatarData(relatorio.dataRelatorio),
    criadoEm: formatarData(relatorio.criadoEm),
    atualizadoEm: formatarData(relatorio.atualizadoEm),
    // Formata datas aninhadas nos relacionamentos
    ...(relatorio.relatorioVendas && {
      relatorioVendas: relatorio.relatorioVendas.map(rv => ({
        ...rv,
        venda: rv.venda ? {
          ...rv.venda,
          data: formatarData(rv.venda.data)
        } : null
      }))
    }),
    ...(relatorio.relatorioFinanceiro && {
      relatorioFinanceiro: relatorio.relatorioFinanceiro.map(rf => ({
        ...rf,
        data: formatarData(rf.data)
      }))
    }),
    ...(relatorio.usuario && relatorio.usuario.dataNascimento && {
      usuario: {
        ...relatorio.usuario,
        dataNascimento: formatarData(relatorio.usuario.dataNascimento),
        criadoEm: formatarData(relatorio.usuario.criadoEm),
        atualizadoEm: formatarData(relatorio.usuario.atualizadoEm),
        ultimoAcesso: formatarData(relatorio.usuario.ultimoAcesso)
      }
    }),
    ...(relatorio.relatorioClientes && {
      relatorioClientes: relatorio.relatorioClientes.map(rc => ({
        ...rc,
        cliente: rc.cliente ? {
          ...rc.cliente,
          criadoEm: formatarData(rc.cliente.criadoEm),
          atualizadoEm: formatarData(rc.cliente.atualizadoEm)
        } : null
      }))
    }),
    ...(relatorio.relatorioEstoque && {
      relatorioEstoque: relatorio.relatorioEstoque.map(re => ({
        ...re,
        produto: re.produto ? {
          ...re.produto,
          criadoEm: formatarData(re.produto.criadoEm),
          atualizadoEm: formatarData(re.produto.atualizadoEm)
        } : null
      }))
    })
  };
}

// Criar relatório com dados relacionados
const create = async (req, res) => {
  try {
    const { 
      usuarioId, 
      dataInicio, 
      dataFim, 
      observacoes, 
      tipo,
      // Dados específicos para cada tipo de relatório
      vendasIds = [],
      produtosIds = [],
      clientesIds = [],
      dadosFinanceiros = []
    } = req.body;

    // Criar o relatório base
    const relatorio = await prisma.relatorio.create({
      data: {
        usuarioId: usuarioId || null,
        dataInicio: dataInicio ? new Date(dataInicio) : null,
        dataFim: dataFim ? new Date(dataFim) : null,
        observacoes,
        tipo,
        // Criar relacionamentos baseados no tipo
        ...(tipo === 'Vendas' && vendasIds.length > 0 && {
          relatorioVendas: {
            create: vendasIds.map(vendaId => ({ vendaId }))
          }
        }),
        ...(tipo === 'Estoque' && produtosIds.length > 0 && {
          relatorioEstoque: {
            create: await Promise.all(produtosIds.map(async (produtoId) => {
              const produto = await prisma.produto.findUnique({
                where: { id: produtoId }
              });
              return {
                produtoId,
                quantidade: produto?.estoque || 0
              };
            }))
          }
        }),
        ...(tipo === 'Clientes' && clientesIds.length > 0 && {
          relatorioClientes: {
            create: clientesIds.map(clienteId => ({ clienteId }))
          }
        }),
        ...(tipo === 'Financeiro' && dadosFinanceiros.length > 0 && {
          relatorioFinanceiro: {
            create: dadosFinanceiros.map(dado => ({
              tipo: dado.tipo,
              categoria: dado.categoria,
              valor: dado.valor,
              data: new Date(dado.data),
              descricao: dado.descricao
            }))
          }
        })
      },
      include: {
        usuario: true,
        relatorioVendas: {
          include: {
            venda: {
              include: {
                cliente: true,
                itens: {
                  include: {
                    produto: true
                  }
                }
              }
            }
          }
        },
        relatorioEstoque: {
          include: {
            produto: true
          }
        },
        relatorioClientes: {
          include: {
            cliente: true
          }
        },
        relatorioFinanceiro: true
      }
    });

    res.status(201).json(formatarDatas(relatorio));
  } catch (err) {
    console.error('Erro ao criar relatório:', err);
    res.status(400).json({ 
      erro: 'Erro ao criar relatório.', 
      detalhes: err.message 
    });
  }
};

// Listar todos os relatórios com filtros opcionais
const findAll = async (req, res) => {
  try {
    const { tipo, usuarioId, dataInicio, dataFim } = req.query;
    
    const where = {};
    
    if (tipo) where.tipo = tipo;
    if (usuarioId) where.usuarioId = parseInt(usuarioId);
    if (dataInicio || dataFim) {
      where.dataRelatorio = {};
      if (dataInicio) where.dataRelatorio.gte = new Date(dataInicio);
      if (dataFim) where.dataRelatorio.lte = new Date(dataFim);
    }

    const relatorios = await prisma.relatorio.findMany({
      where,
      include: {
        usuario: {
          select: {
            id: true,
            nome: true,
            email: true
          }
        },
        relatorioVendas: {
          include: {
            venda: {
              include: {
                cliente: {
                  select: {
                    id: true,
                    nome: true
                  }
                }
              }
            }
          }
        },
        relatorioEstoque: {
          include: {
            produto: {
              select: {
                id: true,
                nome: true
              }
            }
          }
        },
        relatorioClientes: {
          include: {
            cliente: {
              select: {
                id: true,
                nome: true
              }
            }
          }
        },
        relatorioFinanceiro: true
      },
      orderBy: {
        criadoEm: 'desc'
      }
    });

    res.json(relatorios.map(formatarDatas));
  } catch (err) {
    console.error('Erro ao buscar relatórios:', err);
    res.status(500).json({ 
      erro: 'Erro ao buscar relatórios.', 
      detalhes: err.message 
    });
  }
};

// Buscar relatório por ID com todos os dados relacionados
const findOne = async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido.' });

  try {
    const relatorio = await prisma.relatorio.findUnique({
      where: { id },
      include: {
        usuario: {
          select: {
            id: true,
            nome: true,
            email: true,
            perfil: true
          }
        },
        relatorioVendas: {
          include: {
            venda: {
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
            }
          }
        },
        relatorioEstoque: {
          include: {
            produto: true
          }
        },
        relatorioClientes: {
          include: {
            cliente: true
          }
        },
        relatorioFinanceiro: true
      }
    });

    if (!relatorio) {
      return res.status(404).json({ erro: 'Relatório não encontrado.' });
    }

    res.json(formatarDatas(relatorio));
  } catch (err) {
    console.error('Erro ao buscar relatório:', err);
    res.status(500).json({ 
      erro: 'Erro ao buscar relatório.', 
      detalhes: err.message 
    });
  }
};

// Atualizar relatório
const update = async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido.' });

  try {
    const { observacoes, dataInicio, dataFim } = req.body;
    
    const relatorio = await prisma.relatorio.update({
      where: { id },
      data: {
        observacoes,
        dataInicio: dataInicio ? new Date(dataInicio) : null,
        dataFim: dataFim ? new Date(dataFim) : null,
      },
      include: {
        usuario: true,
        relatorioVendas: {
          include: {
            venda: true
          }
        },
        relatorioEstoque: {
          include: {
            produto: true
          }
        }
      }
    });

    res.json(formatarDatas(relatorio));
  } catch (err) {
    console.error('Erro ao atualizar relatório:', err);
    res.status(400).json({ 
      erro: 'Erro ao atualizar relatório.', 
      detalhes: err.message 
    });
  }
};

// Deletar relatório (com cascade para as tabelas relacionadas)
const remove = async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido.' });

  try {
    await prisma.relatorio.delete({ 
      where: { id } 
    });
    
    res.json({ 
      mensagem: 'Relatório deletado com sucesso.',
      id: id
    });
  } catch (err) {
    console.error('Erro ao deletar relatório:', err);
    res.status(400).json({ 
      erro: 'Erro ao deletar relatório.', 
      detalhes: err.message 
    });
  }
};

// Método específico para gerar relatório de vendas com filtros
const gerarRelatorioVendas = async (req, res) => {
  try {
    const { dataInicio, dataFim, usuarioId, status } = req.body;

    // Buscar vendas com os filtros
    const where = {};
    if (dataInicio || dataFim) {
      where.data = {};
      if (dataInicio) where.data.gte = new Date(dataInicio);
      if (dataFim) where.data.lte = new Date(dataFim);
    }
    if (usuarioId) where.usuarioId = parseInt(usuarioId);
    if (status) where.status = status;

    const vendas = await prisma.venda.findMany({
      where,
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

    // Calcular totais
    const totalVendas = vendas.reduce((sum, venda) => sum + venda.total, 0);
    const quantidadeVendas = vendas.length;

    // Criar relatório
    const relatorio = await prisma.relatorio.create({
      data: {
        usuarioId: usuarioId || null,
        dataInicio: dataInicio ? new Date(dataInicio) : null,
        dataFim: dataFim ? new Date(dataFim) : null,
        tipo: 'Vendas',
        observacoes: `Relatório de vendas - ${quantidadeVendas} vendas - Total: R$ ${totalVendas.toFixed(2)}`,
        relatorioVendas: {
          create: vendas.map(venda => ({ vendaId: venda.id }))
        }
      },
      include: {
        usuario: true,
        relatorioVendas: {
          include: {
            venda: {
              include: {
                cliente: true,
                itens: {
                  include: {
                    produto: true
                  }
                }
              }
            }
          }
        }
      }
    });

    res.status(201).json({
      ...formatarDatas(relatorio),
      resumo: {
        totalVendas: totalVendas,
        quantidadeVendas: quantidadeVendas,
        periodo: {
          dataInicio: formatarData(dataInicio),
          dataFim: formatarData(dataFim)
        }
      }
    });
  } catch (err) {
    console.error('Erro ao gerar relatório de vendas:', err);
    res.status(400).json({ 
      erro: 'Erro ao gerar relatório de vendas.', 
      detalhes: err.message 
    });
  }
};

// Função auxiliar para formatar datas (também exportada se necessário)
function formatarData(data) {
  if (!data) return null;
  const date = new Date(data);
  
  const dia = date.getDate().toString().padStart(2, '0');
  const mes = (date.getMonth() + 1).toString().padStart(2, '0');
  const ano = date.getFullYear().toString().slice(-2);
  const horas = date.getHours().toString().padStart(2, '0');
  const minutos = date.getMinutes().toString().padStart(2, '0');
  
  return `${dia}/${mes}/${ano} ${horas}:${minutos}`;
}

module.exports = {
  create,
  findAll,
  findOne,
  update,
  delete: remove,
  gerarRelatorioVendas,
  formatarData // Exportando caso precise usar em outros lugares
};