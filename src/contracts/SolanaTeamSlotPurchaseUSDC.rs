use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

// 合约地址：重新部署到Devnet的程序ID
declare_id!("3NGwXTcUZ2sECBiKZy9AphP9bALA9i37twVpkcMMZtPi");

/// Solana团队槽位购买系统 - 仅支持USDC支付
/// 对应EVM的TeamRegistry.ts中的buyteamamount相关功能
/// 
/// 仅支持USDC支付，价格2 USDT等值
/// Devnet测试USDC: Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr
/// 统一收款地址（USDC）: 8TcQfQY12sMweH9EkvrrXbcgSeB5KGLTUPA4Jmixpm74

#[program]
pub mod team_slot_purchase {
    use super::*;

    /// 初始化Slot购买系统
    pub fn initialize_slot_system(
        ctx: Context<InitializeSlotSystem>,
        slot_price_usdc: u64,
        default_team_limit: u8,
    ) -> Result<()> {
        let slot_config = &mut ctx.accounts.slot_config;
        
        slot_config.authority = ctx.accounts.authority.key();
        slot_config.treasury_usdc = ctx.accounts.treasury_usdc.key();
        slot_config.usdc_mint = ctx.accounts.usdc_mint.key();
        slot_config.slot_price_usdc = slot_price_usdc;
        slot_config.default_team_limit = default_team_limit;
        slot_config.total_slots_sold = 0;
        slot_config.is_active = true;
        slot_config.bump = ctx.bumps.slot_config;
        
        msg!("Team Slot Purchase system initialized (USDC only)");
        msg!("USDC price: {} tokens", slot_price_usdc);
        Ok(())
    }

    /// 使用USDC购买团队槽位
    pub fn buy_team_slot_usdc(ctx: Context<BuyTeamSlotUsdc>) -> Result<()> {
        let slot_config = &ctx.accounts.slot_config;
        let user_limit = &mut ctx.accounts.user_limit;
        
        require!(slot_config.is_active, ErrorCode::SystemNotActive);
        require!(slot_config.slot_price_usdc > 0, ErrorCode::InvalidPrice);
        
        // USDC代币转账
        let transfer_accounts = Transfer {
            from: ctx.accounts.user_usdc_account.to_account_info(),
            to: ctx.accounts.treasury_usdc_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        
        token::transfer(
            CpiContext::new(ctx.accounts.token_program.to_account_info(), transfer_accounts),
            slot_config.slot_price_usdc,
        )?;
        
        // 更新用户限制
        user_limit.team_limit += 1;
        user_limit.total_spent_usdc += slot_config.slot_price_usdc;
        user_limit.slots_purchased += 1;
        
        // 更新全局统计
        let slot_config = &mut ctx.accounts.slot_config;
        slot_config.total_slots_sold += 1;
        
        emit!(TeamSlotPurchased {
            user: user_limit.user,
            amount_paid: slot_config.slot_price_usdc,
            new_team_limit: user_limit.team_limit,
            transaction_id: Clock::get()?.unix_timestamp,
        });
        
        msg!("Team slot purchased with USDC by: {}", ctx.accounts.user.key());
        Ok(())
    }

    /// 初始化用户团队限制账户
    pub fn initialize_user_limit(ctx: Context<InitializeUserLimit>) -> Result<()> {
        let slot_config = &ctx.accounts.slot_config;
        let user_limit = &mut ctx.accounts.user_limit;
        
        user_limit.user = ctx.accounts.user.key();
        user_limit.team_limit = slot_config.default_team_limit;
        user_limit.teams_created = 0;
        user_limit.slots_purchased = 0;
        user_limit.total_spent_usdc = 0;
        user_limit.bump = ctx.bumps.user_limit;
        
        msg!("User team limit initialized for: {}", ctx.accounts.user.key());
        Ok(())
    }

    /// 增加团队计数（当用户创建团队时调用）
    pub fn increment_team_count(ctx: Context<IncrementTeamCount>) -> Result<()> {
        let user_limit = &mut ctx.accounts.user_limit;
        
        require!(user_limit.teams_created < user_limit.team_limit, ErrorCode::TeamLimitExceeded);
        
        user_limit.teams_created += 1;
        
        msg!("Team count incremented: {}/{}", user_limit.teams_created, user_limit.team_limit);
        Ok(())
    }

    /// 减少团队计数（当用户删除团队时调用）
    pub fn decrement_team_count(ctx: Context<DecrementTeamCount>) -> Result<()> {
        let user_limit = &mut ctx.accounts.user_limit;
        
        require!(user_limit.teams_created > 0, ErrorCode::NoTeamsToDecrement);
        
        user_limit.teams_created -= 1;
        
        msg!("Team count decremented: {}/{}", user_limit.teams_created, user_limit.team_limit);
        Ok(())
    }

    /// 管理员设置价格
    pub fn set_slot_price(
        ctx: Context<SetSlotPrice>,
        new_usdc_price: u64,
    ) -> Result<()> {
        let slot_config = &mut ctx.accounts.slot_config;
        
        slot_config.slot_price_usdc = new_usdc_price;
        msg!("USDC price updated to: {} tokens", new_usdc_price);
        
        emit!(SlotPriceUpdated {
            usdc_price: slot_config.slot_price_usdc,
            updated_by: ctx.accounts.authority.key(),
        });
        
        Ok(())
    }

    /// 管理员激活/停用系统
    pub fn toggle_system_status(ctx: Context<ToggleSystemStatus>) -> Result<()> {
        let slot_config = &mut ctx.accounts.slot_config;
        slot_config.is_active = !slot_config.is_active;
        
        msg!("System status toggled to: {}", slot_config.is_active);
        Ok(())
    }

    /// 管理员更新收款地址
    pub fn update_treasury_address(
        ctx: Context<UpdateTreasuryAddress>,
        new_treasury_usdc: Pubkey,
    ) -> Result<()> {
        let slot_config = &mut ctx.accounts.slot_config;
        
        slot_config.treasury_usdc = new_treasury_usdc;
        msg!("USDC treasury updated to: {}", new_treasury_usdc);
        
        Ok(())
    }
}

// ===================== 账户结构定义 =====================

/// 系统配置账户
#[account]
pub struct SlotConfig {
    pub authority: Pubkey,           // 管理员公钥
    pub treasury_usdc: Pubkey,       // USDC收费钱包
    pub usdc_mint: Pubkey,           // USDC代币地址
    pub slot_price_usdc: u64,        // USDC价格（最小单位）
    pub default_team_limit: u8,      // 默认团队限制
    pub total_slots_sold: u64,       // 总销售slot数量
    pub is_active: bool,             // 系统是否激活
    pub bump: u8,                    // PDA bump
}

/// 用户团队限制账户
#[account]
pub struct UserTeamLimit {
    pub user: Pubkey,              // 用户公钥
    pub team_limit: u8,            // 团队数量限制
    pub teams_created: u8,         // 已创建团队数量
    pub slots_purchased: u64,      // 已购买槽位数量
    pub total_spent_usdc: u64,     // USDC总支出
    pub bump: u8,                  // PDA bump
}

// ===================== 上下文定义 =====================

/// 初始化系统
#[derive(Accounts)]
pub struct InitializeSlotSystem<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 32 + 8 + 1 + 8 + 1 + 1,
        seeds = [b"slot_config"],
        bump
    )]
    pub slot_config: Account<'info, SlotConfig>,
    
    /// CHECK: 这是USDC收款地址
    pub treasury_usdc: AccountInfo<'info>,
    
    /// CHECK: 这是USDC代币地址
    pub usdc_mint: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

/// 使用USDC购买团队槽位
#[derive(Accounts)]
pub struct BuyTeamSlotUsdc<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"slot_config"],
        bump = slot_config.bump
    )]
    pub slot_config: Account<'info, SlotConfig>,
    
    #[account(
        mut,
        seeds = [b"user_team_limit", user.key().as_ref()],
        bump = user_limit.bump
    )]
    pub user_limit: Account<'info, UserTeamLimit>,
    
    #[account(mut)]
    pub user_usdc_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub treasury_usdc_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}

/// 初始化用户限制
#[derive(Accounts)]
pub struct InitializeUserLimit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        seeds = [b"slot_config"],
        bump = slot_config.bump
    )]
    pub slot_config: Account<'info, SlotConfig>,
    
    #[account(
        init,
        payer = user,
        space = 8 + 32 + 1 + 1 + 8 + 8 + 1,
        seeds = [b"user_team_limit", user.key().as_ref()],
        bump
    )]
    pub user_limit: Account<'info, UserTeamLimit>,
    
    pub system_program: Program<'info, System>,
}

/// 增加团队计数
#[derive(Accounts)]
pub struct IncrementTeamCount<'info> {
    pub user: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"user_team_limit", user.key().as_ref()],
        bump = user_limit.bump
    )]
    pub user_limit: Account<'info, UserTeamLimit>,
}

/// 减少团队计数
#[derive(Accounts)]
pub struct DecrementTeamCount<'info> {
    pub user: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"user_team_limit", user.key().as_ref()],
        bump = user_limit.bump
    )]
    pub user_limit: Account<'info, UserTeamLimit>,
}

/// 设置slot价格
#[derive(Accounts)]
pub struct SetSlotPrice<'info> {
    #[account(
        mut,
        has_one = authority,
        seeds = [b"slot_config"],
        bump = slot_config.bump
    )]
    pub slot_config: Account<'info, SlotConfig>,
    
    pub authority: Signer<'info>,
}

/// 切换系统状态
#[derive(Accounts)]
pub struct ToggleSystemStatus<'info> {
    #[account(
        mut,
        has_one = authority,
        seeds = [b"slot_config"],
        bump = slot_config.bump
    )]
    pub slot_config: Account<'info, SlotConfig>,
    
    pub authority: Signer<'info>,
}

/// 更新收款地址
#[derive(Accounts)]
pub struct UpdateTreasuryAddress<'info> {
    #[account(
        mut,
        has_one = authority,
        seeds = [b"slot_config"],
        bump = slot_config.bump
    )]
    pub slot_config: Account<'info, SlotConfig>,
    
    pub authority: Signer<'info>,
}

// ===================== 事件定义 =====================

#[event]
pub struct TeamSlotPurchased {
    pub user: Pubkey,
    pub amount_paid: u64,
    pub new_team_limit: u8,
    pub transaction_id: i64,
}

#[event]
pub struct SlotPriceUpdated {
    pub usdc_price: u64,
    pub updated_by: Pubkey,
}

// ===================== 错误定义 =====================

#[error_code]
pub enum ErrorCode {
    #[msg("System is not active")]
    SystemNotActive,
    #[msg("Invalid price configuration")]
    InvalidPrice,
    #[msg("Team limit exceeded")]
    TeamLimitExceeded,
    #[msg("No teams to decrement")]
    NoTeamsToDecrement,
}