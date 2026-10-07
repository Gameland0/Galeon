use anchor_lang::prelude::*;

declare_id!("6XjuPcso5CRNbHE8rWZ8hhER9iDFfA7jXpf86EksWr5V");

/// Solana团队Agent注册合约
/// 功能：团队创建、管理和Agent关联
/// 对应EVM的TeamRegistry.ts（主要功能部分）

#[program]
pub mod solana_team_registry {
    use super::*;

    /// 初始化团队注册表
    pub fn initialize_team_registry(ctx: Context<InitializeTeamRegistry>) -> Result<()> {
        let team_registry = &mut ctx.accounts.team_registry;
        
        team_registry.authority = ctx.accounts.authority.key();
        team_registry.team_counter = 0;
        team_registry.bump = ctx.bumps["team_registry"];
        
        msg!("Team Registry initialized with authority: {}", team_registry.authority);
        Ok(())
    }

    /// 注册新团队（对应EVM的registerTeam）
    pub fn register_team(
        ctx: Context<RegisterTeam>,
        team_uuid: String,
        name: String,
        description: String,
        agents: Vec<AgentRole>, // Agent ID和角色的组合
    ) -> Result<()> {
        // 参数验证
        require!(team_uuid.len() <= 36, ErrorCode::TeamUuidTooLong);
        require!(name.len() <= 64, ErrorCode::NameTooLong);
        require!(description.len() <= 200, ErrorCode::DescriptionTooLong);
        require!(agents.len() >= 2, ErrorCode::InsufficientAgents);
        require!(agents.len() <= 5, ErrorCode::TooManyAgents);

        // 验证角色长度
        for agent in &agents {
            require!(agent.role.len() <= 32, ErrorCode::RoleTooLong);
        }

        let team_registry = &mut ctx.accounts.team_registry;
        let team = &mut ctx.accounts.team;
        let clock = Clock::get()?;

        // 设置团队数据
        team.id = team_registry.team_counter;
        team.team_uuid = team_uuid.clone();
        team.owner = ctx.accounts.user.key();
        team.name = name.clone();
        team.description = description.clone();
        team.agent_count = agents.len() as u8;
        team.max_agents = 5;
        team.is_active = true;
        team.created_at = clock.unix_timestamp;
        team.updated_at = clock.unix_timestamp;
        team.bump = ctx.bumps["team"];

        // 更新计数器
        team_registry.team_counter += 1;

        // 发出事件
        emit!(TeamRegistered {
            team_id: team.id,
            team_uuid: team_uuid,
            owner: team.owner,
            name: name,
            agent_count: team.agent_count,
        });

        msg!("Team registered successfully: ID {}, Name: {}", team.id, team.name);
        Ok(())
    }

    /// 更新团队信息（对应EVM的updateTeam）
    pub fn update_team(
        ctx: Context<UpdateTeam>,
        name: String,
        description: String,
        agents: Vec<AgentRole>,
    ) -> Result<()> {
        // 参数验证
        require!(name.len() <= 64, ErrorCode::NameTooLong);
        require!(description.len() <= 200, ErrorCode::DescriptionTooLong);
        require!(agents.len() >= 2, ErrorCode::InsufficientAgents);
        require!(agents.len() <= 5, ErrorCode::TooManyAgents);

        // 验证角色长度
        for agent in &agents {
            require!(agent.role.len() <= 32, ErrorCode::RoleTooLong);
        }

        let team = &mut ctx.accounts.team;
        let clock = Clock::get()?;

        // 更新团队信息
        team.name = name.clone();
        team.description = description.clone();
        team.agent_count = agents.len() as u8;
        team.updated_at = clock.unix_timestamp;

        emit!(TeamUpdated {
            team_id: team.id,
            name: name,
            agent_count: team.agent_count,
            updated_at: team.updated_at,
        });

        msg!("Team {} updated successfully", team.id);
        Ok(())
    }

    /// 添加Agent到团队
    pub fn add_agent_to_team(
        ctx: Context<AddAgentToTeam>,
        agent_id: u64,
        role: String,
    ) -> Result<()> {
        require!(role.len() <= 32, ErrorCode::RoleTooLong);
        
        let team = &mut ctx.accounts.team;
        let team_agent = &mut ctx.accounts.team_agent;
        let clock = Clock::get()?;

        // 检查团队是否已满
        require!(team.agent_count < team.max_agents, ErrorCode::TeamFull);
        
        // 设置团队Agent关联
        team_agent.team_id = team.id;
        team_agent.agent_id = agent_id;
        team_agent.role = role.clone();
        team_agent.added_at = clock.unix_timestamp;
        team_agent.bump = ctx.bumps["team_agent"];
        
        // 更新团队Agent计数
        team.agent_count += 1;
        team.updated_at = clock.unix_timestamp;
        
        emit!(AgentAddedToTeam {
            team_id: team.id,
            agent_id,
            role: role.clone(),
        });
        
        msg!("Agent {} added to team {} with role: {}", agent_id, team.id, role);
        Ok(())
    }

    /// 从团队移除Agent
    pub fn remove_agent_from_team(
        ctx: Context<RemoveAgentFromTeam>,
        _agent_id: u64,
    ) -> Result<()> {
        let team = &mut ctx.accounts.team;
        let team_agent = &ctx.accounts.team_agent;
        
        // 检查最少Agent数量
        require!(team.agent_count > 2, ErrorCode::MinimumAgentsRequired);
        
        // 更新团队Agent计数
        team.agent_count -= 1;
        team.updated_at = Clock::get()?.unix_timestamp;
        
        emit!(AgentRemovedFromTeam {
            team_id: team.id,
            agent_id: team_agent.agent_id,
        });
        
        msg!("Agent {} removed from team {}", team_agent.agent_id, team.id);
        Ok(())
    }

    /// 更新Agent在团队中的角色
    pub fn update_agent_role(
        ctx: Context<UpdateAgentRole>,
        new_role: String,
    ) -> Result<()> {
        require!(new_role.len() <= 32, ErrorCode::RoleTooLong);
        
        let team_agent = &mut ctx.accounts.team_agent;
        let old_role = team_agent.role.clone();
        
        team_agent.role = new_role.clone();
        
        emit!(AgentRoleUpdated {
            team_id: team_agent.team_id,
            agent_id: team_agent.agent_id,
            old_role,
            new_role: new_role.clone(),
        });
        
        msg!("Agent {} role updated to: {}", team_agent.agent_id, new_role);
        Ok(())
    }

    /// 激活/停用团队
    pub fn toggle_team_status(ctx: Context<ToggleTeamStatus>) -> Result<()> {
        let team = &mut ctx.accounts.team;
        team.is_active = !team.is_active;
        team.updated_at = Clock::get()?.unix_timestamp;

        emit!(TeamStatusToggled {
            team_id: team.id,
            is_active: team.is_active,
        });

        msg!("Team {} status toggled to: {}", team.id, if team.is_active { "active" } else { "inactive" });
        Ok(())
    }

    /// 获取团队信息（只读查询）
    pub fn get_team(ctx: Context<GetTeam>) -> Result<TeamInfo> {
        let team = &ctx.accounts.team;
        
        Ok(TeamInfo {
            id: team.id,
            team_uuid: team.team_uuid.clone(),
            owner: team.owner,
            name: team.name.clone(),
            description: team.description.clone(),
            agent_count: team.agent_count,
            max_agents: team.max_agents,
            is_active: team.is_active,
            created_at: team.created_at,
            updated_at: team.updated_at,
        })
    }
}

// ===== 数据结构定义 =====

/// Agent角色结构
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct AgentRole {
    pub id: u64,
    pub role: String,
}

/// 团队信息返回结构
#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct TeamInfo {
    pub id: u64,
    pub team_uuid: String,
    pub owner: Pubkey,
    pub name: String,
    pub description: String,
    pub agent_count: u8,
    pub max_agents: u8,
    pub is_active: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

/// 团队注册表
#[account]
pub struct TeamRegistry {
    pub authority: Pubkey,       // 程序管理员
    pub team_counter: u64,       // 团队计数器
    pub bump: u8,               // PDA bump
}

impl TeamRegistry {
    pub const SPACE: usize = 8 + 32 + 8 + 1;
}

/// 团队账户
#[account]
pub struct Team {
    pub id: u64,                 // 团队ID
    pub team_uuid: String,       // UUID字符串（前端生成）
    pub owner: Pubkey,           // 团队所有者
    pub name: String,            // 团队名称（最大64字符）
    pub description: String,     // 描述（最大200字符）
    pub agent_count: u8,         // 当前Agent数量
    pub max_agents: u8,          // 最大Agent数量（5）
    pub is_active: bool,         // 是否激活
    pub created_at: i64,         // 创建时间
    pub updated_at: i64,         // 更新时间
    pub bump: u8,               // PDA bump
}

impl Team {
    pub const SPACE: usize = 8 + 8 + (4+36) + 32 + (4+64) + (4+200) + 1 + 1 + 1 + 8 + 8 + 1;
}

/// 团队Agent关联
#[account]
pub struct TeamAgent {
    pub team_id: u64,            // 团队ID
    pub agent_id: u64,           // Agent ID
    pub role: String,            // 角色（最大32字符）
    pub added_at: i64,           // 添加时间
    pub bump: u8,               // PDA bump
}

impl TeamAgent {
    pub const SPACE: usize = 8 + 8 + 8 + (4+32) + 8 + 1;
}

// ===== 账户验证结构 =====

/// 初始化团队注册表
#[derive(Accounts)]
pub struct InitializeTeamRegistry<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        init,
        payer = authority,
        space = TeamRegistry::SPACE,
        seeds = [b"team_registry"],
        bump
    )]
    pub team_registry: Account<'info, TeamRegistry>,
    
    pub system_program: Program<'info, System>,
}

/// 注册团队
#[derive(Accounts)]
pub struct RegisterTeam<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"team_registry"],
        bump = team_registry.bump
    )]
    pub team_registry: Account<'info, TeamRegistry>,
    
    #[account(
        init,
        payer = user,
        space = Team::SPACE,
        seeds = [b"team", team_registry.team_counter.to_le_bytes().as_ref()],
        bump
    )]
    pub team: Account<'info, Team>,
    
    pub system_program: Program<'info, System>,
}

/// 更新团队
#[derive(Accounts)]
pub struct UpdateTeam<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"team", team.id.to_le_bytes().as_ref()],
        bump = team.bump,
        constraint = team.owner == user.key() @ ErrorCode::UnauthorizedOwner,
        constraint = team.is_active @ ErrorCode::TeamNotActive
    )]
    pub team: Account<'info, Team>,
}

/// 添加Agent到团队
#[derive(Accounts)]
#[instruction(agent_id: u64)]
pub struct AddAgentToTeam<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"team", team.id.to_le_bytes().as_ref()],
        bump = team.bump,
        constraint = team.owner == user.key() @ ErrorCode::UnauthorizedOwner,
        constraint = team.is_active @ ErrorCode::TeamNotActive
    )]
    pub team: Account<'info, Team>,
    
    #[account(
        init,
        payer = user,
        space = TeamAgent::SPACE,
        seeds = [b"team_agent", team.id.to_le_bytes().as_ref(), agent_id.to_le_bytes().as_ref()],
        bump
    )]
    pub team_agent: Account<'info, TeamAgent>,
    
    pub system_program: Program<'info, System>,
}

/// 从团队移除Agent
#[derive(Accounts)]
#[instruction(agent_id: u64)]
pub struct RemoveAgentFromTeam<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"team", team.id.to_le_bytes().as_ref()],
        bump = team.bump,
        constraint = team.owner == user.key() @ ErrorCode::UnauthorizedOwner
    )]
    pub team: Account<'info, Team>,
    
    #[account(
        mut,
        close = user,
        seeds = [b"team_agent", team.id.to_le_bytes().as_ref(), agent_id.to_le_bytes().as_ref()],
        bump = team_agent.bump
    )]
    pub team_agent: Account<'info, TeamAgent>,
}

/// 更新Agent角色
#[derive(Accounts)]
pub struct UpdateAgentRole<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        seeds = [b"team", team.id.to_le_bytes().as_ref()],
        bump = team.bump,
        constraint = team.owner == user.key() @ ErrorCode::UnauthorizedOwner
    )]
    pub team: Account<'info, Team>,
    
    #[account(
        mut,
        seeds = [b"team_agent", team_agent.team_id.to_le_bytes().as_ref(), team_agent.agent_id.to_le_bytes().as_ref()],
        bump = team_agent.bump
    )]
    pub team_agent: Account<'info, TeamAgent>,
}

/// 切换团队状态
#[derive(Accounts)]
pub struct ToggleTeamStatus<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"team", team.id.to_le_bytes().as_ref()],
        bump = team.bump,
        constraint = team.owner == user.key() @ ErrorCode::UnauthorizedOwner
    )]
    pub team: Account<'info, Team>,
}

/// 获取团队信息
#[derive(Accounts)]
pub struct GetTeam<'info> {
    #[account(
        seeds = [b"team", team.id.to_le_bytes().as_ref()],
        bump = team.bump
    )]
    pub team: Account<'info, Team>,
}

// ===== 事件定义 =====

#[event]
pub struct TeamRegistered {
    pub team_id: u64,
    pub team_uuid: String,
    pub owner: Pubkey,
    pub name: String,
    pub agent_count: u8,
}

#[event]
pub struct TeamUpdated {
    pub team_id: u64,
    pub name: String,
    pub agent_count: u8,
    pub updated_at: i64,
}

#[event]
pub struct AgentAddedToTeam {
    pub team_id: u64,
    pub agent_id: u64,
    pub role: String,
}

#[event]
pub struct AgentRemovedFromTeam {
    pub team_id: u64,
    pub agent_id: u64,
}

#[event]
pub struct AgentRoleUpdated {
    pub team_id: u64,
    pub agent_id: u64,
    pub old_role: String,
    pub new_role: String,
}

#[event]
pub struct TeamStatusToggled {
    pub team_id: u64,
    pub is_active: bool,
}

// ===== 错误代码定义 =====

#[error_code]
pub enum ErrorCode {
    #[msg("Team UUID is too long (max 36 characters)")]
    TeamUuidTooLong,
    #[msg("Name is too long (max 64 characters)")]
    NameTooLong,
    #[msg("Description is too long (max 200 characters)")]
    DescriptionTooLong,
    #[msg("Role is too long (max 32 characters)")]
    RoleTooLong,
    #[msg("Insufficient agents (minimum 2 required)")]
    InsufficientAgents,
    #[msg("Too many agents (maximum 5 allowed)")]
    TooManyAgents,
    #[msg("Team is full (maximum 5 agents)")]
    TeamFull,
    #[msg("Minimum 2 agents required in team")]
    MinimumAgentsRequired,
    #[msg("Unauthorized: not the team owner")]
    UnauthorizedOwner,
    #[msg("Team is not active")]
    TeamNotActive,
}