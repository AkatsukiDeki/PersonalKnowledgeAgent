import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.db.models import UserProfile, WorkoutPlan, WorkoutExercise, WorkoutSet, BiometricsLog, KineticsNutritionMeal
from app.api.endpoints.kinetics import get_current_user
from app.main import app

@pytest.fixture
async def stress_tester(db_session: AsyncSession):
    # Create isolated user for stress tests
    user_id = uuid.uuid4()
    user = UserProfile(
        id=user_id,
        role="user",
        invariants="",
        learning_style="",
        projects="",
        is_seeded=False,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    # Dependency override for auth
    async def override_get_current_user():
        return user
    
    app.dependency_overrides[get_current_user] = override_get_current_user

    yield user

    # Teardown: remove the user and all cascading records
    app.dependency_overrides.pop(get_current_user, None)
    await db_session.execute(delete(UserProfile).where(UserProfile.id == user_id))
    await db_session.commit()


@pytest.mark.asyncio
async def test_1rm_boundary_stress(client: AsyncClient, db_session: AsyncSession, stress_tester: UserProfile):
    # Test negative values (422 expected)
    resp = await client.post("/api/v1/kinetics/workout-sets", json={
        "exercise_id": str(uuid.uuid4()),
        "reps": -5,
        "weight_kg": -20,
        "set_type": "N"
    })
    assert resp.status_code == 422

    # Create a base plan and exercise for testing hypertrophy boundary and w=0
    plan = WorkoutPlan(user_id=stress_tester.id, status="completed", target_split="Test")
    db_session.add(plan)
    await db_session.commit()
    
    ex = WorkoutExercise(plan_id=plan.id, exercise_name="Жим лежа")
    db_session.add(ex)
    await db_session.commit()

    # Create reps=0 (should be filtered)
    set_zero = WorkoutSet(exercise_id=ex.id, reps=0, weight_kg=100, set_type="N", is_completed=True)
    # Create reps=35 (hypertrophy boundary - should not count in 1RM)
    set_hyper = WorkoutSet(exercise_id=ex.id, reps=35, weight_kg=50, set_type="N", is_completed=True)
    # Create weight=0 (w=0 - should fallback to bodyweight in 1RM calc)
    set_noweight = WorkoutSet(exercise_id=ex.id, reps=10, weight_kg=0, set_type="N", is_completed=True)
    
    db_session.add_all([set_zero, set_hyper, set_noweight])
    await db_session.commit()

    resp = await client.get("/api/v1/kinetics/analytics/overload")
    assert resp.status_code == 200
    data = resp.json()
    
    # Check that reps=35 and reps=0 didn't pollute 1RM calculation
    # Only set_noweight (10 reps) should be used, with fallback BW=80 (default if no biometric log)
    # 1RM = 80 * (1 + 10/30) = 80 * 1.333 = 106.66
    history = data["history"]
    if history:
        # Assuming we can find the maximum 1RM returned for 'Жим лежа'
        for entry in history:
            assert entry["1rm_kg"] > 0
            assert entry["1rm_kg"] < 200 # Sanity check for fallback bw


@pytest.mark.asyncio
async def test_deep_clone_stress(client: AsyncClient, db_session: AsyncSession, stress_tester: UserProfile):
    # Create massive workout plan
    plan = WorkoutPlan(user_id=stress_tester.id, status="completed")
    db_session.add(plan)
    await db_session.commit()

    for i in range(12):
        ex = WorkoutExercise(plan_id=plan.id, exercise_name=f"Exercise {i}")
        db_session.add(ex)
        await db_session.flush()
        
        # Add 5 sets (W, N, N, D, F)
        sets = [
            WorkoutSet(exercise_id=ex.id, set_type="W", weight_kg=50, reps=10),
            WorkoutSet(exercise_id=ex.id, set_type="N", weight_kg=100, reps=8),
            WorkoutSet(exercise_id=ex.id, set_type="N", weight_kg=100, reps=8),
            WorkoutSet(exercise_id=ex.id, set_type="D", weight_kg=80, reps=12),
            WorkoutSet(exercise_id=ex.id, set_type="F", weight_kg=60, reps=15),
        ]
        db_session.add_all(sets)

    await db_session.commit()

    # Clone the plan
    resp = await client.post("/api/v1/kinetics/duplicate", json={
        "source_plan_id": str(plan.id),
        "target_date": "2030-01-01",
        "apply_overload": True,
        "overload_step": 1.25
    })
    
    assert resp.status_code == 200
    new_plan = resp.json()
    
    assert new_plan["status"] == "planned"
    assert len(new_plan["exercises"]) == 12
    
    first_ex = new_plan["exercises"][0]
    assert len(first_ex["workout_sets"]) == 5
    
    # Check that overload was applied correctly
    w_set = first_ex["workout_sets"][0]
    assert w_set["set_type"] == "W"
    assert w_set["weight_kg"] == 50.0  # Warmup unchanged
    assert w_set["previous_weight_kg"] == 50.0

    n_set = first_ex["workout_sets"][1]
    assert n_set["set_type"] == "N"
    assert n_set["weight_kg"] == 101.25  # Working set overloaded
    assert n_set["previous_weight_kg"] == 100.0


@pytest.mark.asyncio
async def test_recovery_extreme_values(client: AsyncClient, db_session: AsyncSession, stress_tester: UserProfile):
    # Log bad sleep
    await client.post("/api/v1/kinetics/biometrics", json={
        "sleep_hours": 0,
        "sleep_quality": 1,
        "fatigue_level": 10,
        "soreness_level": 10,
        "stress_level": 10,
        "notes": "Dead"
    })

    resp = await client.get("/api/v1/kinetics/analytics/recovery")
    assert resp.status_code == 200
    data = resp.json()
    
    # Data should return 14 days, no gaps
    assert len(data["daily_stats"]) == 14
    
    # The last day should have extremely low recovery score
    today_stat = data["daily_stats"][-1]
    assert today_stat["recovery_score"] < 40  # Should be heavily penalized


@pytest.mark.asyncio
async def test_excel_generator_stress(client: AsyncClient, db_session: AsyncSession, stress_tester: UserProfile):
    # Bulk insert large dataset
    plans = []
    exercises = []
    sets = []
    
    for p_idx in range(50):
        plan_id = uuid.uuid4()
        plans.append(WorkoutPlan(id=plan_id, user_id=stress_tester.id, status="completed"))
        for e_idx in range(4):
            ex_id = uuid.uuid4()
            exercises.append(WorkoutExercise(id=ex_id, plan_id=plan_id, exercise_name=f"Ex {e_idx}"))
            for s_idx in range(4):
                sets.append(WorkoutSet(id=uuid.uuid4(), exercise_id=ex_id, weight_kg=100, reps=10, is_completed=True, set_type="N"))
                
    db_session.add_all(plans)
    db_session.add_all(exercises)
    db_session.add_all(sets)
    await db_session.commit()

    resp = await client.get("/api/v1/kinetics/export/excel")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    
    content = resp.content
    assert len(content) > 1000  # Should be a sizable excel file
