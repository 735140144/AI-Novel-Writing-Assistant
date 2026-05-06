import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

export default function BillingNavigationCard() {
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle>计费管理</CardTitle>
        <CardDescription className={AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}>
          配置模型价格、套餐模板和兑换码。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="secondary">1M tokens 计价</Badge>
          <Badge variant="secondary">先套餐每日额度，再钱包余额</Badge>
        </div>
        <div className={`text-sm text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
          这里管理用户可兑换的套餐和钱包余额，以及每个模型的输入、输出和缓存命中价格。
        </div>
        <Button asChild className={AUTO_DIRECTOR_MOBILE_CLASSES.fullWidthAction}>
          <Link to="/settings/billing">进入计费管理</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
