import { getTodos, getUsers, toggleTodoStatus } from "@/app/actions/todos"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/authOptions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CheckCircle2, Circle, User as UserIcon } from "lucide-react"

export const dynamic = "force-dynamic";

export default async function TodosPage() {
    const session = await getServerSession(authOptions)
    const [todos, users] = await Promise.all([
        getTodos(),
        getUsers()
    ])

    // Extraemos el usuario de la sesión de forma segura
    const currentUser = session?.user

    // Filtros: ahora comparamos el id de forma segura
    const myPending = todos.filter(t => t.userId === currentUser?.id && !t.completed)
    const teamPending = todos.filter(t => !t.completed)
    const finished = todos.filter(t => t.completed)

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Gestión de Tareas</h1>
                <Badge variant="outline" className="px-3 py-1 text-sm bg-slate-50">
                    <UserIcon className="h-3 w-3 mr-2" />
                    {/* Usamos .name porque ahí guardaste el username en authOptions */}
                    Sesión: @{currentUser?.name || 'Admin'}
                </Badge>
            </div>

            <Tabs defaultValue="propias" className="w-full">
                <TabsList className="grid w-full grid-cols-3 mb-6">
                    <TabsTrigger value="propias">Mis Pendientes ({myPending.length})</TabsTrigger>
                    <TabsTrigger value="equipo">Equipo ({teamPending.length})</TabsTrigger>
                    <TabsTrigger value="finalizadas">Finalizadas ({finished.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="propias">
                    <TodoTable tasks={myPending} showUser={false} />
                </TabsContent>

                <TabsContent value="equipo">
                    <TodoTable tasks={teamPending} showUser={true} />
                </TabsContent>

                <TabsContent value="finalizadas">
                    <TodoTable tasks={finished} showUser={true} isFinished={true} />
                </TabsContent>
            </Tabs>
        </div>
    )
}

function TodoTable({ tasks, showUser, isFinished = false }: { tasks: any[], showUser: boolean, isFinished?: boolean }) {
    return (
        <Card className="shadow-sm">
            <CardContent className="p-0">
                <Table>
                    <TableHeader className="bg-slate-50">
                        <TableRow>
                            <TableHead className="w-[50px]">Estado</TableHead>
                            <TableHead>Tarea</TableHead>
                            {showUser && <TableHead>Asignado a</TableHead>}
                            <TableHead>Prioridad</TableHead>
                            <TableHead className="text-right">Fecha</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {tasks.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={showUser ? 5 : 4} className="h-24 text-center text-gray-400">
                                    No hay tareas en esta sección.
                                </TableCell>
                            </TableRow>
                        ) : (
                            tasks.map((task) => (
                                <TableRow key={task.id} className={isFinished ? "opacity-60 bg-slate-50/30" : ""}>
                                    <TableCell>
                                        {/* Botón para cambiar estado */}
                                        <form action={async () => {
                                            "use server"
                                            await toggleTodoStatus(task.id, !task.completed)
                                        }}>
                                            <button type="submit" className="hover:scale-110 transition-transform">
                                                {task.completed ? (
                                                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                                                ) : (
                                                    <Circle className="h-6 w-6 text-gray-300" />
                                                )}
                                            </button>
                                        </form>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className={`font-medium ${task.completed ? "line-through text-gray-500" : ""}`}>
                                                {task.content}
                                            </span>
                                        </div>
                                    </TableCell>
                                    {showUser && (
                                        <TableCell>
                                            <Badge variant="secondary" className="font-mono text-[10px]">
                                                @{task.user.username}
                                            </Badge>
                                        </TableCell>
                                    )}
                                    <TableCell>
                                        <Badge className={`uppercase text-[10px] ${priorityColor(task.priority)}`}>
                                            {task.priority === 'urgente' && "⚠️ "}{task.priority}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right text-xs text-gray-500">
                                        {new Date(task.createdAt).toLocaleDateString('es-AR')}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    )
}

function priorityColor(p: string) {
    switch (p) {
        case 'urgente': return 'bg-red-100 text-red-700 border-red-200 shadow-sm'
        case 'alta': return 'bg-orange-100 text-orange-700 border-orange-200'
        case 'media': return 'bg-blue-100 text-blue-700 border-blue-200'
        default: return 'bg-slate-100 text-slate-700 border-slate-200'
    }
}
